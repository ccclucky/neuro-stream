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
  GatewayChallenge,
  CallServiceOptions,
  CallServiceResult,
} from './types';

export interface NeuroStreamConfig {
  apiKey: string;                          // Required — platform API Key (ns_live_...)
  privateKey: `0x${string}`;               // Required — wallet private key
  apiUrl?: string;                         // Optional — defaults to NEUROSTREAM_API_URL env
  gatewayUrl?: string;                     // Optional — defaults to NEUROSTREAM_GATEWAY_URL env
  rpcUrl?: string;                         // Optional — defaults to MONAD_RPC_URL env
  escrowAddress?: `0x${string}`;           // Optional — defaults to ESCROW_CONTRACT_ADDRESS env
  chainId?: number;
}

export class NeuroStream {
  public readonly escrow: EscrowClient;
  public readonly discovery: DiscoveryClient;
  public readonly metrics: MetricsReporter;
  private gatewayUrl: string | undefined;
  private apiKey: string;

  constructor(config: NeuroStreamConfig) {
    const apiUrl = config.apiUrl || process.env.NEUROSTREAM_API_URL;
    if (!apiUrl) {
      throw new Error('apiUrl is required: pass it in config or set NEUROSTREAM_API_URL env var');
    }

    this.apiKey = config.apiKey;
    this.gatewayUrl = config.gatewayUrl || process.env.NEUROSTREAM_GATEWAY_URL;

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
   *   - If gatewayUrl is configured, uses the Gateway flow (recommended)
   *   - Otherwise falls back to direct Provider flow (legacy)
   *
   * Gateway flow:
   *   1. POST gateway/invoke { serviceId, params } → 402 challenge
   *   2. Escrow.open(provider=gateway, hashLock, amount)
   *   3. POST gateway/invoke { serviceId, params, requestId } → plain result
   *
   * Returns result + selected service info + latency
   */
  async callService(options: CallServiceOptions): Promise<CallServiceResult> {
    const startTime = Date.now();

    // Discover service first (needed for both flows)
    let service: ServiceWithMetrics;

    if (options.keyword) {
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
      const found = await this.discovery.getService(options.serviceId);
      if (!found) {
        throw new Error(`Service not found: ${options.serviceId}`);
      }
      service = found;
    } else {
      throw new Error('callService requires either keyword or serviceId');
    }

    // Use Gateway if configured
    if (this.gatewayUrl) {
      const { result, requestId } = await this.invokeViaGateway(
        service.serviceId,
        options.params,
        options.timeout
      );

      const latencyMs = Date.now() - startTime;

      // Report metrics (fire-and-forget)
      this.metrics.reportCallLog({
        serviceId: service.serviceId,
        requestId,
        agentAddress: this.address,
        success: true,
        latencyMs,
        schemaMatch: true,
      }).catch(() => {});

      return { result, requestId, service, latencyMs };
    }

    // Legacy: direct Provider flow
    const { result, requestId } = await this.invokeService(
      service.endpoint,
      options.params,
      { timeout: options.timeout, serviceId: service.serviceId }
    );

    const latencyMs = Date.now() - startTime;
    return { result, requestId, service, latencyMs };
  }

  /**
   * Gateway-based invocation:
   * 1. POST gateway/invoke { serviceId, params } → 402 { requestId, hashLock, amount, recipient, deadline }
   * 2. Escrow.open(provider=recipient, hashLock, amount)
   * 3. POST gateway/invoke { serviceId, params, requestId } → { result }
   * 4. If timeout → poll GET gateway/status?requestId=xxx
   */
  private async invokeViaGateway(
    serviceId: string,
    params: Record<string, unknown>,
    timeout = 60000
  ): Promise<{ result: string; requestId: `0x${string}` }> {
    const gatewayUrl = this.gatewayUrl!;

    // Step 1: Request challenge
    const challengeRes = await fetch(`${gatewayUrl}/api/gateway/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({ serviceId, params }),
    });

    if (challengeRes.status !== 402) {
      const body = await challengeRes.text();
      throw new Error(`Expected 402 from Gateway, got ${challengeRes.status}: ${body}`);
    }

    const challenge = (await challengeRes.json()) as GatewayChallenge;

    // Step 2: Lock funds in escrow (provider = Gateway wallet)
    const openHash = await this.escrow.open({
      requestId: challenge.requestId as `0x${string}`,
      provider: challenge.recipient as `0x${string}`,
      hashLock: challenge.hashLock as `0x${string}`,
      deadline: BigInt(challenge.deadline),
      amount: BigInt(challenge.amount),
    });

    await this.escrow.waitForTransaction(openHash);

    // Step 3: Submit payment proof → Gateway calls Provider + claims
    const resultRes = await fetch(`${gatewayUrl}/api/gateway/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({ serviceId, params, requestId: challenge.requestId }),
      signal: AbortSignal.timeout(timeout),
    }).catch(async (err) => {
      // On timeout, fall through to polling
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return null;
      }
      throw err;
    });

    if (resultRes && resultRes.ok) {
      const data = (await resultRes.json()) as { result?: string; status?: string };
      if (data.result) {
        return {
          result: data.result,
          requestId: challenge.requestId as `0x${string}`,
        };
      }
    }

    // Step 4: Poll status endpoint
    return this.pollGatewayStatus(challenge.requestId as `0x${string}`, timeout);
  }

  /**
   * Poll the Gateway status endpoint until COMPLETED or terminal state.
   */
  private async pollGatewayStatus(
    requestId: `0x${string}`,
    timeoutMs: number
  ): Promise<{ result: string; requestId: `0x${string}` }> {
    const gatewayUrl = this.gatewayUrl!;
    const deadline = Date.now() + timeoutMs;
    const pollInterval = 2000;

    while (Date.now() < deadline) {
      const res = await fetch(
        `${gatewayUrl}/api/gateway/status?requestId=${encodeURIComponent(requestId)}`,
        {
          headers: { 'x-api-key': this.apiKey },
        }
      );

      if (!res.ok) {
        throw new Error(`Gateway status check failed: ${res.status}`);
      }

      const data = (await res.json()) as { status?: string; result?: string; error?: string };

      if (data.status === 'COMPLETED' && data.result) {
        return { result: data.result, requestId };
      }

      if (['FAILED', 'REFUNDABLE', 'REFUNDED'].includes(data.status!)) {
        throw new Error(`Gateway request ${data.status}: ${data.error || 'unknown error'}`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error('Gateway polling timeout');
  }

  /**
   * Legacy: Complete service invocation flow (direct Provider):
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
    }).catch(() => {});

    return { result: plaintext, requestId };
  }
}
