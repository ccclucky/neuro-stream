import { createPublicClient, http } from 'viem';
import { createClient } from '@supabase/supabase-js';
import { createIndexer } from './indexer.js';

const rpcUrl = process.env.MONAD_RPC_URL;
const escrowAddress = process.env.ESCROW_CONTRACT_ADDRESS as `0x${string}`;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pollIntervalMs = Number(process.env.INDEXER_POLL_INTERVAL_MS ?? 3000);

const missing = [
  !rpcUrl && 'MONAD_RPC_URL',
  !escrowAddress && 'ESCROW_CONTRACT_ADDRESS',
  !supabaseUrl && 'SUPABASE_URL',
  !supabaseServiceKey && 'SUPABASE_SERVICE_ROLE_KEY',
].filter(Boolean);

if (missing.length > 0) {
  console.warn(`[indexer] Skipping — missing env vars: ${missing.join(', ')}`);
  process.exit(0);
}

const viemClient = createPublicClient({ transport: http(rpcUrl) });
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const indexer = createIndexer({
  viemClient,
  supabase,
  escrowAddress,
  pollIntervalMs,
});

console.log(`[indexer] Starting — escrow=${escrowAddress}, poll=${pollIntervalMs}ms`);
indexer.start();

process.on('SIGINT', () => {
  console.log('[indexer] Shutting down...');
  indexer.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[indexer] Shutting down...');
  indexer.stop();
  process.exit(0);
});
