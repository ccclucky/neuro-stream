#!/usr/bin/env npx tsx
/**
 * NeuroStream SDK Agent Demo
 *
 * Simulates a real Agent using the NeuroStream SDK client.
 * One call to `invokeService()` automatically handles the full 5-step flow:
 *   1. POST → 402 + hashLock (payment challenge)
 *   2. Escrow.open() — lock funds
 *   3. POST with requestId → encrypted content
 *   4. waitForPaymentReleased() — watch chain for preimage
 *   5. AES-GCM decrypt → return plaintext
 *
 * Prerequisites:
 *   - Hardhat node running (localhost:8545)
 *   - Escrow contract deployed
 *   - Provider service running (localhost:3001)
 *
 * Run: pnpm demo:agent
 */

import { formatEther } from 'viem';
import { createPublicClient, http } from 'viem';
import { hardhat } from 'viem/chains';
import { NeuroStream } from '../packages/sdk/src/client.js';

// ============ Configuration ============
const ESCROW_ADDRESS = (process.env.ESCROW_CONTRACT_ADDRESS ||
  '0x5fbdb2315678afecb367f032d93f642f64180aa3') as `0x${string}`;
const RPC_URL = process.env.MONAD_RPC_URL || 'http://127.0.0.1:8545';
const PROVIDER_API = process.env.PROVIDER_API_URL || 'http://localhost:3001';
const API_URL = process.env.NEUROSTREAM_API_URL || 'https://uppsdjgmgfwbknbzvhby.supabase.co/functions/v1';
const API_KEY = process.env.NEUROSTREAM_API_KEY || 'ns_live_dev_placeholder';

// Hardhat account #0
const AGENT_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;

// ============ Helpers ============
function divider(title: string) {
  console.log('\n' + '─'.repeat(60));
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

// ============ Main ============
async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          NeuroStream SDK Agent Demo                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Public client for balance queries
  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(RPC_URL),
  });

  // Initialize NeuroStream SDK client
  const client = new NeuroStream({
    apiKey: API_KEY,
    privateKey: AGENT_PRIVATE_KEY,
    apiUrl: API_URL,
    rpcUrl: RPC_URL,
    escrowAddress: ESCROW_ADDRESS,
    chainId: 31337,
  });

  console.log('\n  Configuration:');
  console.log(`    Provider API:    ${PROVIDER_API}`);
  console.log(`    Escrow Contract: ${ESCROW_ADDRESS}`);
  console.log(`    Agent Address:   ${client.address}`);
  console.log(`    API URL:         ${API_URL}`);

  // ========== Pre-invocation state ==========
  divider('Pre-invocation State');

  const balanceBefore = await publicClient.getBalance({ address: client.address });
  console.log(`\n  Agent balance: ${formatEther(balanceBefore)} ETH`);

  // ========== Invoke service via SDK ==========
  divider('Invoking service via SDK (one call, 5 steps)');

  const serviceInput = { text: 'Hello from SDK Agent!' };
  console.log(`\n  Endpoint: ${PROVIDER_API}/invoke`);
  console.log(`  Params:   ${JSON.stringify(serviceInput)}`);
  console.log('\n  SDK invokeService() running...');
  console.log('    Step 1: POST → 402 payment challenge');
  console.log('    Step 2: Escrow.open() — locking funds');
  console.log('    Step 3: POST with requestId → encrypted content');
  console.log('    Step 4: Watching chain for PaymentReleased event');
  console.log('    Step 5: AES-GCM decrypt with preimage\n');

  const startTime = Date.now();

  const { result, requestId } = await client.invokeService(
    `${PROVIDER_API}/invoke`,
    serviceInput,
    { timeout: 30000 }
  );

  const elapsed = Date.now() - startTime;

  // ========== Results ==========
  divider('Results');

  const balanceAfter = await publicClient.getBalance({ address: client.address });
  const spent = balanceBefore - balanceAfter;

  console.log(`\n  requestId: ${requestId}`);
  console.log(`  elapsed:   ${elapsed}ms`);
  console.log(`\n  Balance before: ${formatEther(balanceBefore)} ETH`);
  console.log(`  Balance after:  ${formatEther(balanceAfter)} ETH`);
  console.log(`  Spent (fee+gas): ${formatEther(spent)} ETH`);

  // Parse and display decrypted result
  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    parsed = result;
  }
  console.log(`\n  Decrypted result:`);
  console.log(`    ${JSON.stringify(parsed, null, 2).replace(/\n/g, '\n    ')}`);

  // ========== Summary ==========
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              SDK Agent Demo Complete!                       ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║                                                            ║');
  console.log('║  One SDK call (invokeService) handled all 5 steps:         ║');
  console.log('║    1. Payment challenge (402)                              ║');
  console.log('║    2. Escrow lock (open)                                   ║');
  console.log('║    3. Encrypted response                                   ║');
  console.log('║    4. On-chain preimage (auto-claim)                       ║');
  console.log('║    5. AES-GCM decryption                                   ║');
  console.log('║                                                            ║');
  console.log('║  No manual crypto, no raw contract calls — just SDK!       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');
}

main().catch((err) => {
  console.error('\n  Error:', err.message || err);
  process.exit(1);
});
