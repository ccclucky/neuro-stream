import { formatUnits } from 'viem';
import { createPublicClient, http } from 'viem';
import { hardhat } from 'viem/chains';
import { type NeuroStream, ERC20ABI } from '@neurostream/sdk';

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

  const tokenAddress = process.env.PAYMENT_TOKEN_ADDRESS as `0x${string}` | undefined;
  const tokenDecimals = Number(process.env.PAYMENT_TOKEN_DECIMALS || '6');

  let balanceBefore = 0n;
  if (tokenAddress) {
    balanceBefore = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20ABI,
      functionName: 'balanceOf',
      args: [client.address],
    }) as bigint;
  }

  const startTime = Date.now();

  // One-liner: auto-discover + pay + invoke
  const { result, requestId, service } = await client.callService({
    keyword: keyword || undefined,
    params: { text },
    timeout: 30000,
  });

  const latencyMs = Date.now() - startTime;

  let cost = '0';
  if (tokenAddress) {
    const balanceAfter = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20ABI,
      functionName: 'balanceOf',
      args: [client.address],
    }) as bigint;
    const spent = balanceBefore - balanceAfter;
    cost = formatUnits(spent, tokenDecimals);
  }

  return {
    result,
    requestId,
    cost,
    latencyMs,
  };
}
