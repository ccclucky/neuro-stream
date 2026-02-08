import { keccak256, toHex } from 'viem';
import { EscrowClient } from './escrow';
import { DiscoveryClient } from './discovery';
import { MetricsReporter } from './metrics';
import { decrypt } from './crypto';
import type {
  DiscoveryOptions,
  ServiceWithMetrics,
  PaymentChallenge,
  InvokeOptions,
  CallServiceOptions,
  CallServiceResult,
} from './types';

export interface NeuroStreamConfig {
  apiKey: string;                          // Required — platform API Key (ns_live_...)
  privateKey: `0x${string}`;               // Required — wallet private key
  apiUrl?: string;                         // Optional — defaults to NEUROSTREAM_API_URL env
  rpcUrl?: string;                         // Optional — defaults to MONAD_RPC_URL env
  escrowAddress?: `0x${string}`;           // Optional — defaults to ESCROW_CONTRACT_ADDRESS env
  chainId?: number;
}

export class NeuroStream {
  public readonly escrow: EscrowClient;
  public readonly discovery: DiscoveryClient;
  public readonly metrics: MetricsReporter;

  constructor(config: NeuroStreamConfig) {
    const apiUrl = config.apiUrl || process.env.NEUROSTREAM_API_URL;
    if (!apiUrl) {
      throw new Error('apiUrl is required: pass it in config or set NEUROSTREAM_API_URL env var');
    }

    this.escrow = new EscrowClient({
      privateKey: config.privateKey,
      rpcUrl: config.rpcUrl,
      escrowAddress: config.escrowAddress,
      chainId: config.chainId,
    });

    this.discovery = new DiscoveryClient(apiUrl, config.apiKey);
    this.metrics = new MetricsReporter(apiUrl, config.apiKey);
  }

  get address(): `0x${string}` {
    return this.escrow.address;
  }

  /**
   * Discover available services sorted by quality score
   */
  async discoverServices(options: DiscoveryOptions = {}): Promise<ServiceWithMetrics[]> {
    return this.discovery.discoverServices(options);
  }

  /**
   * High-level service call API:
   *   - keyword mode: auto-discover → pick best → invoke
   *   - serviceId mode: lookup service → invoke
   * Returns result + selected service info + latency
   */
  async callService(options: CallServiceOptions): Promise<CallServiceResult> {
    const startTime = Date.now();
    let service: ServiceWithMetrics;

    if (options.keyword) {
      // Auto-discover by keyword, pick the highest quality_score
      const services = await this.discoverServices({
        keyword: options.keyword,
        type: options.type,
        minQualityScore: options.minQualityScore,
      });
      if (services.length === 0) {
        throw new Error(`No services found matching keyword "${options.keyword}"`);
      }
      service = services[0];
    } else if (options.serviceId) {
      // Direct lookup by serviceId
      const found = await this.discovery.getService(options.serviceId);
      if (!found) {
        throw new Error(`Service not found: ${options.serviceId}`);
      }
      service = found;
    } else {
      throw new Error('callService requires either keyword or serviceId');
    }

    // Invoke the service
    const { result, requestId } = await this.invokeService(
      service.endpoint,
      options.params,
      { timeout: options.timeout, serviceId: service.serviceId }
    );

    const latencyMs = Date.now() - startTime;

    return { result, requestId, service, latencyMs };
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
    this.metrics.reportCallLog({
      serviceId: options.serviceId || endpoint,
      requestId,
      agentAddress: this.address,
      success: true,
      latencyMs,
      schemaMatch: true,
    }).catch(() => {
      // Silently ignore metrics reporting failures
    });

    return { result: plaintext, requestId };
  }
}
