import { formatEther } from 'viem';
import { createPublicClient, http } from 'viem';
import { hardhat } from 'viem/chains';
import type { NeuroStream } from '@neurostream/sdk';

export interface InvokeResult {
  result: string;
  requestId: string;
  cost: string;
  latencyMs: number;
}

/**
 * Discover available services via the NeuroStream SDK.
 * Returns a JSON string of service list for Gemini to consume.
 */
export async function discoverServices(
  client: NeuroStream,
  keyword?: string,
  type?: string,
): Promise<string> {
  const services = await client.discoverServices({ keyword, type });

  if (services.length === 0) {
    return JSON.stringify({ services: [], message: 'No services found' });
  }

  const summary = services.map((s) => ({
    serviceId: s.serviceId,
    endpoint: s.endpoint,
    pricing: s.pricing,
    qualityScore: s.metrics?.qualityScore ?? 0,
    schema: s.schema,
  }));

  return JSON.stringify({ services: summary });
}

/**
 * Invoke a NeuroStream service via on-chain escrow payment.
 * Returns a JSON string with the result and payment info.
 */
export async function invokeService(
  client: NeuroStream,
  endpoint: string,
  text: string,
  rpcUrl: string,
  serviceId?: string,
): Promise<InvokeResult> {
  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(rpcUrl),
  });

  const balanceBefore = await publicClient.getBalance({ address: client.address });
  const startTime = Date.now();

  const { result, requestId } = await client.invokeService(
    endpoint,
    { text },
    { timeout: 30000, serviceId },
  );

  const latencyMs = Date.now() - startTime;
  const balanceAfter = await publicClient.getBalance({ address: client.address });
  const spent = balanceBefore - balanceAfter;

  return {
    result,
    requestId,
    cost: formatEther(spent),
    latencyMs,
  };
}
