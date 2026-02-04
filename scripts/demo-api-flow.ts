#!/usr/bin/env npx tsx
/**
 * NeuroStream API Flow Demo
 *
 * 演示通过 Provider API 的完整付费流程：
 * 1. 调用 Provider API → 收到 402 + hashLock
 * 2. Agent 锁定资金到 Escrow
 * 3. 再次调用 API（带 requestId）→ 收到加密内容
 * 4. Provider 自动 claim（preimage 上链公开）
 * 5. Agent 从链上事件获取 preimage → 解密
 *
 * 前提：
 * - Hardhat 节点运行中 (localhost:8545)
 * - Provider 服务运行中 (localhost:3001)
 * - Escrow 合约已部署
 *
 * 运行: pnpm demo:api
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  parseEther,
  formatEther,
  hexToBytes,
  parseAbiItem,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';
import { gcm } from '@noble/ciphers/aes';

// ============ 配置 ============
const ESCROW_ADDRESS = (process.env.ESCROW_CONTRACT_ADDRESS ||
  '0x5fbdb2315678afecb367f032d93f642f64180aa3') as `0x${string}`;
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const PROVIDER_API = process.env.PROVIDER_API || 'http://localhost:3001';

const AGENT_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// Escrow ABI
const EscrowABI = [
  {
    inputs: [
      { name: 'requestId', type: 'bytes32' },
      { name: 'provider', type: 'address' },
      { name: 'hashLock', type: 'bytes32' },
      { name: 'deadline', type: 'uint64' },
    ],
    name: 'open',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'requestId', type: 'bytes32' }],
    name: 'getPayment',
    outputs: [
      {
        components: [
          { name: 'agent', type: 'address' },
          { name: 'provider', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'hashLock', type: 'bytes32' },
          { name: 'deadline', type: 'uint64' },
          { name: 'status', type: 'uint8' },
        ],
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ============ 工具函数 ============
function decrypt(ciphertextB64: string, key: Hex): string {
  const keyBytes = hexToBytes(key);
  const combined = Buffer.from(ciphertextB64, 'base64');
  const nonce = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);
  const cipher = gcm(keyBytes, nonce);
  const plaintext = cipher.decrypt(ciphertext);
  return Buffer.from(plaintext).toString('utf-8');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printStep(step: number, title: string) {
  console.log('\n' + '─'.repeat(60));
  console.log(`  Step ${step}: ${title}`);
  console.log('─'.repeat(60));
}

interface ChallengeResponse {
  amount: string;
  asset: string;
  recipient: string;
  hashLock: string;
  deadline: number;
}

interface InvokeResponse {
  ciphertext: string;
  requestId: string;
}

// ============ 主流程 ============
async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          NeuroStream API Flow Demo                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(RPC_URL),
  });

  const agentAccount = privateKeyToAccount(AGENT_PRIVATE_KEY as Hex);
  const agentWallet = createWalletClient({
    account: agentAccount,
    chain: hardhat,
    transport: http(RPC_URL),
  });

  const serviceInput = { text: 'Hello, NeuroStream!' };

  console.log('\n  Configuration:');
  console.log(`    Provider API:    ${PROVIDER_API}`);
  console.log(`    Escrow Contract: ${ESCROW_ADDRESS}`);
  console.log(`    Agent:           ${agentAccount.address}`);

  // 记录 claim 前的区块号，用于后续查询事件
  const blockBefore = await publicClient.getBlockNumber();

  await sleep(500);

  // ========== Step 1: 调用 API 获取 402 ==========
  printStep(1, 'Agent calls Provider API → receives 402');

  console.log(`\n  → POST ${PROVIDER_API}/invoke`);
  console.log(`    Body: ${JSON.stringify(serviceInput)}`);

  const challengeRes = await fetch(`${PROVIDER_API}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serviceInput),
  });

  const challenge: ChallengeResponse = await challengeRes.json();

  console.log(`  ← HTTP ${challengeRes.status} Payment Required`);
  console.log(`    amount:   ${challenge.amount} ${challenge.asset}`);
  console.log(`    provider: ${challenge.recipient}`);
  console.log(`    hashLock: ${challenge.hashLock.slice(0, 20)}...`);

  await sleep(1000);

  // ========== Step 2: Agent 锁定资金 ==========
  printStep(2, 'Agent locks funds in Escrow');

  const requestId = keccak256(toHex(`api-demo-${Date.now()}`));
  const amount = parseEther(challenge.amount);

  console.log(`\n  requestId: ${requestId.slice(0, 20)}...`);
  console.log(`  amount:    ${formatEther(amount)} ETH`);
  console.log('\n  Calling Escrow.open()...');

  const openHash = await agentWallet.writeContract({
    address: ESCROW_ADDRESS,
    abi: EscrowABI,
    functionName: 'open',
    args: [
      requestId,
      challenge.recipient as `0x${string}`,
      challenge.hashLock as `0x${string}`,
      BigInt(challenge.deadline),
    ],
    value: amount,
  });

  await publicClient.waitForTransactionReceipt({ hash: openHash });
  console.log(`  ✓ Funds locked! Tx: ${openHash.slice(0, 20)}...`);

  await sleep(1000);

  // ========== Step 3: 再次调用 API 获取加密内容 ==========
  printStep(3, 'Agent calls API with requestId → receives ciphertext');

  const requestBody = { ...serviceInput, requestId };
  console.log(`\n  → POST ${PROVIDER_API}/invoke`);
  console.log(`    Body: { text: "${serviceInput.text}", requestId: "${requestId.slice(0, 20)}..." }`);

  const resultRes = await fetch(`${PROVIDER_API}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const result: InvokeResponse = await resultRes.json();
  console.log(`  ← HTTP ${resultRes.status}`);
  console.log(`    ciphertext: ${result.ciphertext.slice(0, 30)}...`);
  console.log('\n  ✓ Got ciphertext! Cannot decrypt yet (no preimage)');
  console.log('  ⏳ Provider is auto-claiming in background...');

  // ========== Step 4: 等待 Provider 自动 claim ==========
  printStep(4, 'Waiting for Provider auto-claim → preimage on-chain');

  let preimage: Hex | null = null;

  // 轮询链上状态，等待 Provider claim
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    process.stdout.write('.');

    const payment = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: EscrowABI,
      functionName: 'getPayment',
      args: [requestId],
    });

    if (payment.status === 2) {
      // Released! 从事件日志获取 preimage
      const logs = await publicClient.getLogs({
        address: ESCROW_ADDRESS,
        event: parseAbiItem(
          'event PaymentReleased(bytes32 indexed requestId, address indexed provider, uint256 amount, bytes32 preimage)'
        ),
        fromBlock: blockBefore,
        toBlock: 'latest',
      });

      const releaseLog = logs.find(
        (log) => log.args.requestId === requestId
      );

      if (releaseLog?.args.preimage) {
        preimage = releaseLog.args.preimage as Hex;
      }

      console.log('\n\n  ✓ Payment released!');
      break;
    }
  }

  if (!preimage) {
    console.error('\n  ✗ Timeout waiting for Provider claim');
    process.exit(1);
  }

  // ========== Step 5: Agent 解密 ==========
  printStep(5, 'Agent decrypts content with preimage from chain');

  console.log(`\n  Preimage (from chain event): ${preimage.slice(0, 20)}...`);

  const decrypted = decrypt(result.ciphertext, preimage);
  const parsed = JSON.parse(decrypted);

  console.log('\n  ✓ Decrypted result:');
  console.log(`    ${JSON.stringify(parsed, null, 2).replace(/\n/g, '\n    ')}`);

  // ========== 完成 ==========
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                  Full API Flow Complete!                    ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  1. Agent called API     → got 402 with hashLock           ║');
  console.log('║  2. Agent locked funds   → Escrow.open()                   ║');
  console.log('║  3. Agent called API     → got ciphertext                  ║');
  console.log('║  4. Provider auto-claim  → preimage revealed on-chain      ║');
  console.log('║  5. Agent decrypted      → got service result              ║');
  console.log('║                                                            ║');
  console.log('║  No trust needed - cryptographic guarantees only!          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');
}

main().catch(console.error);
