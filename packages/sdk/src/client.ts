import { keccak256, toHex } from 'viem';
import { EscrowClient, type EscrowClientConfig } from './escrow';
import { DiscoveryClient } from './discovery';
import { MetricsReporter } from './metrics';
import { generateKey, computeHashLock, decrypt } from './crypto';
import type {
  DiscoveryOptions,
  ServiceWithMetrics,
  PaymentChallenge,
  InvokeOptions,
} from './types';

export interface NeuroStreamConfig extends EscrowClientConfig {
  supabaseUrl?: string;
  supabaseKey?: string;
}

export class NeuroStream {
  public readonly escrow: EscrowClient;
  public readonly discovery: DiscoveryClient | null;
  public readonly metrics: MetricsReporter | null;

  constructor(config: NeuroStreamConfig) {
    this.escrow = new EscrowClient(config);

    this.discovery =
      config.supabaseUrl && config.supabaseKey
        ? new DiscoveryClient(config.supabaseUrl, config.supabaseKey)
        : null;

    this.metrics =
      config.supabaseUrl && config.supabaseKey
        ? new MetricsReporter(config.supabaseUrl, config.supabaseKey)
        : null;
  }

  get address(): `0x${string}` {
    return this.escrow.address;
  }

  /**
   * Discover available services sorted by quality score
   */
  async discoverServices(options: DiscoveryOptions = {}): Promise<ServiceWithMetrics[]> {
    if (!this.discovery) {
      throw new Error('Supabase URL and key are required for service discovery');
    }
    return this.discovery.discoverServices(options);
  }

  /**
   * Complete service invocation flow:
   * 1. Request payment challenge (402)
   * 2. Lock funds in escrow
   * 3. Get encrypted result
   * 4. Wait for provider to claim (reveals preimage on-chain)
   * 5. Decrypt and return result
   */
  async invokeService(
    endpoint: string,
    params: Record<string, unknown>,
    options: InvokeOptions = {}
  ): Promise<{ result: string; requestId: `0x${string}` }> {
    const startTime = Date.now();
    const timeout = options.timeout ?? 60000;

    // Step 1: Get payment challenge
    const challengeResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (challengeResponse.status !== 402) {
      throw new Error(`Expected 402 Payment Required, got ${challengeResponse.status}`);
    }

    const challenge = (await challengeResponse.json()) as PaymentChallenge;

    // Step 2: Generate requestId and lock funds
    const requestId = keccak256(
      toHex(`${this.address}:${challenge.recipient}:${Date.now()}:${Math.random()}`)
    );

    const deadline = BigInt(challenge.deadline);

    const openHash = await this.escrow.open({
      requestId,
      provider: challenge.recipient,
      hashLock: challenge.hashLock,
      deadline,
      amount: challenge.amount,
    });

    await this.escrow.waitForTransaction(openHash);

    // Step 3: Request service with payment proof
    const serviceResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        requestId,
      }),
    });

    if (!serviceResponse.ok) {
      throw new Error(`Service request failed: ${serviceResponse.status}`);
    }

    const { ciphertext } = (await serviceResponse.json()) as { ciphertext: string };

    // Step 4: Wait for PaymentReleased event (provider claims, revealing preimage)
    const event = await this.escrow.waitForPaymentReleased(requestId, timeout);

    // Step 5: Decrypt with preimage
    const plaintext = decrypt(ciphertext, event.preimage);

    const latencyMs = Date.now() - startTime;

    // Step 6: Report metrics (fire and forget)
    if (this.metrics) {
      this.metrics.reportCallLog({
        serviceId: endpoint,
        requestId,
        agentAddress: this.address,
        success: true,
        latencyMs,
        schemaMatch: true,
      }).catch(() => {
        // Silently ignore metrics reporting failures
      });
    }

    return { result: plaintext, requestId };
  }
}
