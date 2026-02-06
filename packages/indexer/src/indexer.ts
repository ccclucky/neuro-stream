import { type PublicClient, decodeEventLog } from 'viem';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EscrowABI } from './abi.js';
import type { IndexerConfig, PaymentRow } from './types.js';

export interface Indexer {
  start(): void;
  stop(): void;
  poll(): Promise<number>;
}

export interface IndexerDeps {
  viemClient: Pick<PublicClient, 'getLogs' | 'getBlockNumber'>;
  supabase: SupabaseClient;
  escrowAddress: `0x${string}`;
  pollIntervalMs: number;
}

export function createIndexer(deps: IndexerDeps): Indexer {
  const { viemClient, supabase, escrowAddress, pollIntervalMs } = deps;
  let timer: ReturnType<typeof setInterval> | null = null;
  let polling = false;
  let rpcDown = false;

  async function getCursor(): Promise<bigint> {
    const { data, error } = await supabase
      .from('indexer_state')
      .select('last_processed_block')
      .eq('id', 1)
      .single();

    if (error) throw new Error(`Failed to read cursor: ${error.message}`);
    return BigInt(data.last_processed_block);
  }

  async function setCursor(block: bigint): Promise<void> {
    const { error } = await supabase
      .from('indexer_state')
      .update({ last_processed_block: Number(block), updated_at: new Date().toISOString() })
      .eq('id', 1);

    if (error) throw new Error(`Failed to update cursor: ${error.message}`);
  }

  async function poll(): Promise<number> {
    if (polling) return 0;
    polling = true;

    try {
      const fromBlock = (await getCursor()) + 1n;
      const latestBlock = await viemClient.getBlockNumber();

      // Connection restored
      if (rpcDown) {
        rpcDown = false;
        console.log('[indexer] RPC connection restored, resuming...');
      }

      if (fromBlock > latestBlock) return 0;

      const toBlock = latestBlock;

      const logs = await viemClient.getLogs({
        address: escrowAddress,
        fromBlock,
        toBlock,
      });

      let processed = 0;

      for (const log of logs) {
        const txHash = log.transactionHash ?? '0x';
        const blockNumber = log.blockNumber ?? 0n;

        let decoded;
        try {
          decoded = decodeEventLog({
            abi: EscrowABI,
            data: log.data,
            topics: log.topics,
          });
        } catch {
          continue; // Unknown event, skip
        }

        if (decoded.eventName === 'PaymentLocked') {
          const args = decoded.args as {
            requestId: `0x${string}`;
            agent: `0x${string}`;
            provider: `0x${string}`;
            amount: bigint;
            hashLock: `0x${string}`;
            deadline: bigint;
          };

          const row: PaymentRow = {
            request_id: args.requestId,
            agent: args.agent.toLowerCase(),
            provider: args.provider.toLowerCase(),
            amount: args.amount.toString(),
            hash_lock: args.hashLock,
            deadline: Number(args.deadline),
            status: 'Locked',
            preimage: null,
            tx_hash: txHash,
            block_number: Number(blockNumber),
          };

          const { error } = await supabase
            .from('payments')
            .upsert(row, { onConflict: 'request_id' });

          if (error) throw new Error(`Failed to upsert PaymentLocked: ${error.message}`);
          processed++;
        } else if (decoded.eventName === 'PaymentReleased') {
          const args = decoded.args as {
            requestId: `0x${string}`;
            provider: `0x${string}`;
            amount: bigint;
            preimage: `0x${string}`;
          };

          const { error } = await supabase
            .from('payments')
            .update({
              status: 'Released',
              preimage: args.preimage,
              updated_at: new Date().toISOString(),
            })
            .eq('request_id', args.requestId);

          if (error) throw new Error(`Failed to update PaymentReleased: ${error.message}`);
          processed++;
        } else if (decoded.eventName === 'PaymentRefunded') {
          const args = decoded.args as {
            requestId: `0x${string}`;
            agent: `0x${string}`;
            amount: bigint;
          };

          const { error } = await supabase
            .from('payments')
            .update({
              status: 'Refunded',
              updated_at: new Date().toISOString(),
            })
            .eq('request_id', args.requestId);

          if (error) throw new Error(`Failed to update PaymentRefunded: ${error.message}`);
          processed++;
        }
      }

      await setCursor(toBlock);
      return processed;
    } finally {
      polling = false;
    }
  }

  function start(): void {
    if (timer) return;
    poll().catch(onPollError);
    timer = setInterval(() => poll().catch(onPollError), pollIntervalMs);
  }

  function onPollError(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    const isConnectionError = msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('HTTP request failed');
    if (isConnectionError) {
      if (!rpcDown) {
        rpcDown = true;
        console.warn(`[indexer] RPC unreachable, will retry silently every ${pollIntervalMs / 1000}s...`);
      }
      return;
    }
    // Non-connection errors: always log
    console.error('[indexer] Poll error:', msg);
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { start, stop, poll };
}
