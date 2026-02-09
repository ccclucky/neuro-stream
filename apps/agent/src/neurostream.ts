import { formatEther } from 'viem';
import { createPublicClient, http } from 'viem';
import { hardhat } from 'viem/chains';
import type { NeuroStream } from '@neurostream/sdk';

export interface CallResult {
  result: string;
  requestId: string;
  cost: string;
  latencyMs: number;
}

/**
 * Call a NeuroStream service via the Gateway — one line.
 * Handles discovery, escrow payment, and result retrieval.
 */
export async function callService(
  client: NeuroStream,
  keyword: string | undefined,
  text: string,
  rpcUrl: string,
): Promise<CallResult> {
  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(rpcUrl),
  });

  const balanceBefore = await publicClient.getBalance({ address: client.address });
  const startTime = Date.now();

  // One-liner: auto-discover + pay + invoke
  const { result, requestId, service } = await client.callService({
    keyword: keyword || undefined,
    params: { text },
    timeout: 30000,
  });

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
