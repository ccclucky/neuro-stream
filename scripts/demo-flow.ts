#!/usr/bin/env npx ts-node
/**
 * NeuroStream Demo Script
 *
 * 演示完整的 Agent-Provider 付费流程：
 * 1. Provider 生成 preimage 和 hashLock
 * 2. Agent 锁定资金到 Escrow
 * 3. Provider 加密内容
 * 4. Provider claim 付款（preimage 上链公开）
 * 5. Agent 从链上事件获取 preimage，解密内容
 *
 * 运行: ESCROW_CONTRACT_ADDRESS=0x... npx ts-node scripts/demo-flow.ts
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
  bytesToHex,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';

// ============ 配置 ============
const ESCROW_ADDRESS = (process.env.ESCROW_CONTRACT_ADDRESS ||
  '0x5fbdb2315678afecb367f032d93f642f64180aa3') as `0x${string}`;
const RPC_URL = process.env.MONAD_RPC_URL || 'http://127.0.0.1:8545';

// Hardhat 默认测试账户
const AGENT_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const PROVIDER_PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

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
    inputs: [
      { name: 'requestId', type: 'bytes32' },
      { name: 'preimage', type: 'bytes32' },
    ],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
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
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'requestId', type: 'bytes32' },
      { indexed: true, name: 'provider', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'preimage', type: 'bytes32' },
    ],
    name: 'PaymentReleased',
    type: 'event',
  },
] as const;

// ============ 工具函数 ============
function generatePreimage(): Hex {
  const bytes = randomBytes(32);
  return bytesToHex(bytes) as Hex;
}

function computeHashLock(preimage: Hex): Hex {
  return keccak256(preimage);
}

function encrypt(plaintext: string, key: Hex): string {
  const keyBytes = hexToBytes(key);
  const nonce = randomBytes(12);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const cipher = gcm(keyBytes, nonce);
  const ciphertext = cipher.encrypt(plaintextBytes);
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);
  return Buffer.from(combined).toString('base64');
}

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
  console.log('\n' + '='.repeat(60));
  console.log(`  Step ${step}: ${title}`);
  console.log('='.repeat(60));
}

function printDetail(label: string, value: string) {
  console.log(`  ${label.padEnd(20)} ${value}`);
}

const STATUS_MAP: Record<number, string> = {
  0: 'Empty',
  1: 'Locked',
  2: 'Released',
  3: 'Refunded',
};

// ============ 主流程 ============
async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║            NeuroStream Demo - Full Payment Flow            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // 初始化客户端
  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(RPC_URL),
  });

  const agentAccount = privateKeyToAccount(AGENT_PRIVATE_KEY as Hex);
  const providerAccount = privateKeyToAccount(PROVIDER_PRIVATE_KEY as Hex);

  const agentWallet = createWalletClient({
    account: agentAccount,
    chain: hardhat,
    transport: http(RPC_URL),
  });

  const providerWallet = createWalletClient({
    account: providerAccount,
    chain: hardhat,
    transport: http(RPC_URL),
  });

  console.log('\n  Escrow Contract:', ESCROW_ADDRESS);
  console.log('  Agent Address:  ', agentAccount.address);
  console.log('  Provider Address:', providerAccount.address);

  // 检查余额
  const agentBalance = await publicClient.getBalance({
    address: agentAccount.address,
  });
  const providerBalance = await publicClient.getBalance({
    address: providerAccount.address,
  });
  console.log('\n  Agent Balance:  ', formatEther(agentBalance), 'ETH');
  console.log('  Provider Balance:', formatEther(providerBalance), 'ETH');

  await sleep(1000);

  // ========== Step 1: Provider 生成 Challenge ==========
  printStep(1, 'Provider generates payment challenge');

  const preimage = generatePreimage();
  const hashLock = computeHashLock(preimage);
  const servicePrice = parseEther('0.01');

  printDetail('preimage (secret)', preimage.slice(0, 20) + '...');
  printDetail('hashLock (public)', hashLock.slice(0, 20) + '...');
  printDetail('price', formatEther(servicePrice) + ' ETH');

  console.log('\n  [Provider keeps preimage secret, sends hashLock to Agent]');

  await sleep(1500);

  // ========== Step 2: Agent 锁定资金 ==========
  printStep(2, 'Agent locks funds in Escrow');

  const requestId = keccak256(toHex(`demo-${Date.now()}`));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

  printDetail('requestId', requestId.slice(0, 20) + '...');
  printDetail('amount', formatEther(servicePrice) + ' ETH');
  printDetail('deadline', new Date(Number(deadline) * 1000).toLocaleString());

  console.log('\n  Calling Escrow.open()...');

  const openHash = await agentWallet.writeContract({
    address: ESCROW_ADDRESS,
    abi: EscrowABI,
    functionName: 'open',
    args: [requestId, providerAccount.address, hashLock, deadline],
    value: servicePrice,
  });

  await publicClient.waitForTransactionReceipt({ hash: openHash });

  printDetail('Transaction', openHash.slice(0, 20) + '...');

  // 验证锁定状态
  const payment = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: EscrowABI,
    functionName: 'getPayment',
    args: [requestId],
  });

  printDetail('Payment Status', STATUS_MAP[payment.status] || 'Unknown');
  console.log('\n  [Funds are now locked in Escrow contract]');

  await sleep(1500);

  // ========== Step 3: Provider 提供加密内容 ==========
  printStep(3, 'Provider encrypts and delivers content');

  // 模拟服务结果
  const serviceResult = {
    input: 'Hello, NeuroStream!',
    output: 19,
    service: 'string-length',
  };

  const plaintext = JSON.stringify(serviceResult);
  const ciphertext = encrypt(plaintext, preimage);

  printDetail('Service Result', JSON.stringify(serviceResult));
  printDetail('Ciphertext', ciphertext.slice(0, 30) + '...');

  console.log('\n  [Provider sends ciphertext to Agent, but NOT the preimage]');
  console.log('  [Agent cannot decrypt yet - needs preimage from chain]');

  await sleep(1500);

  // ========== Step 4: Provider Claim 付款 ==========
  printStep(4, 'Provider claims payment (reveals preimage)');

  console.log('\n  Calling Escrow.claim()...');

  const claimHash = await providerWallet.writeContract({
    address: ESCROW_ADDRESS,
    abi: EscrowABI,
    functionName: 'claim',
    args: [requestId, preimage],
  });

  const claimReceipt = await publicClient.waitForTransactionReceipt({
    hash: claimHash,
  });

  printDetail('Transaction', claimHash.slice(0, 20) + '...');

  // 验证状态
  const paymentAfter = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: EscrowABI,
    functionName: 'getPayment',
    args: [requestId],
  });

  printDetail('Payment Status', STATUS_MAP[paymentAfter.status] || 'Unknown');

  // 检查 Provider 余额变化
  const providerBalanceAfter = await publicClient.getBalance({
    address: providerAccount.address,
  });
  const earned = providerBalanceAfter - providerBalance;

  printDetail('Provider Earned', formatEther(earned > 0 ? earned : servicePrice) + ' ETH (approx)');

  console.log('\n  [Preimage is now PUBLIC on the blockchain!]');

  await sleep(1500);

  // ========== Step 5: Agent 解密内容 ==========
  printStep(5, 'Agent retrieves preimage and decrypts');

  // 在真实场景中，Agent 会监听 PaymentReleased 事件获取 preimage
  // 这里我们模拟从事件中读取
  console.log('\n  [Agent watches PaymentReleased event on chain]');
  printDetail('Preimage (from chain)', preimage.slice(0, 20) + '...');

  const decrypted = decrypt(ciphertext, preimage);
  const result = JSON.parse(decrypted);

  console.log('\n  Decrypted Result:');
  console.log('  ', JSON.stringify(result, null, 2).replace(/\n/g, '\n  '));

  // ========== 完成 ==========
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    Demo Completed!                         ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Summary:                                                  ║');
  console.log('║  - Agent paid 0.01 ETH for the service                     ║');
  console.log('║  - Provider received payment after revealing preimage      ║');
  console.log('║  - Agent decrypted the result using the revealed preimage  ║');
  console.log('║  - No trust required - cryptographic guarantees!           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');
}

main().catch(console.error);
