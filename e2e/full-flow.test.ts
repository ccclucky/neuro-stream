/**
 * NeuroStream E2E Integration Test
 *
 * This test demonstrates the full flow:
 * 1. Deploy Escrow contract (Hardhat local network)
 * 2. Provider generates payment challenge
 * 3. Agent locks funds in Escrow
 * 4. Provider encrypts and delivers content
 * 5. Provider claims payment (reveals preimage)
 * 6. Agent decrypts content with preimage
 *
 * Prerequisites:
 * - Run `npx hardhat node` in packages/contracts/
 * - Run `npx hardhat run scripts/deploy.ts --network localhost` to deploy contract
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  parseEther,
  hexToBytes,
  bytesToHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';

// Escrow ABI (minimal)
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

// Hardhat default accounts
const AGENT_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const PROVIDER_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

// Crypto helpers
function generatePreimage(): `0x${string}` {
  const bytes = randomBytes(32);
  return `0x${bytesToHex(bytes).replace('0x', '')}` as `0x${string}`;
}

function computeHashLock(preimage: `0x${string}`): `0x${string}` {
  return keccak256(preimage);
}

function encrypt(plaintext: string, key: `0x${string}`): string {
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

function decrypt(ciphertextB64: string, key: `0x${string}`): string {
  const keyBytes = hexToBytes(key);
  const combined = Buffer.from(ciphertextB64, 'base64');
  const nonce = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);
  const cipher = gcm(keyBytes, nonce);
  const plaintext = cipher.decrypt(ciphertext);
  return Buffer.from(plaintext).toString('utf-8');
}

describe('E2E: Full Payment Flow', () => {
  // Skip if no local network
  const ESCROW_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS as `0x${string}` | undefined;

  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http('http://127.0.0.1:8545'),
  });

  const agentAccount = privateKeyToAccount(AGENT_PRIVATE_KEY as `0x${string}`);
  const providerAccount = privateKeyToAccount(PROVIDER_PRIVATE_KEY as `0x${string}`);

  const agentWallet = createWalletClient({
    account: agentAccount,
    chain: hardhat,
    transport: http('http://127.0.0.1:8545'),
  });

  const providerWallet = createWalletClient({
    account: providerAccount,
    chain: hardhat,
    transport: http('http://127.0.0.1:8545'),
  });

  it.skipIf(!ESCROW_ADDRESS)('should complete full payment flow', async () => {
    if (!ESCROW_ADDRESS) {
      console.log('Skipping E2E test - ESCROW_CONTRACT_ADDRESS not set');
      return;
    }

    // === Step 1: Provider generates payment challenge ===
    const preimage = generatePreimage();
    const hashLock = computeHashLock(preimage);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const amount = parseEther('0.001');
    const serviceResult = { length: 11, text: 'hello world' };

    console.log('Step 1: Provider generates challenge');
    console.log('  preimage:', preimage);
    console.log('  hashLock:', hashLock);

    // === Step 2: Agent locks funds in Escrow ===
    const requestId = keccak256(toHex(`test-${Date.now()}`));

    console.log('Step 2: Agent locks funds');
    console.log('  requestId:', requestId);

    const openHash = await agentWallet.writeContract({
      address: ESCROW_ADDRESS,
      abi: EscrowABI,
      functionName: 'open',
      args: [requestId, providerAccount.address, hashLock, deadline],
      value: amount,
    });

    await publicClient.waitForTransactionReceipt({ hash: openHash });
    console.log('  Escrow.open() tx:', openHash);

    // Verify payment is locked
    const payment = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: EscrowABI,
      functionName: 'getPayment',
      args: [requestId],
    });

    expect(payment.status).toBe(1); // Status.Locked
    expect(payment.agent.toLowerCase()).toBe(agentAccount.address.toLowerCase());
    expect(payment.provider.toLowerCase()).toBe(providerAccount.address.toLowerCase());
    console.log('  Payment status: Locked');

    // === Step 3: Provider delivers encrypted content ===
    const ciphertext = encrypt(JSON.stringify(serviceResult), preimage);
    console.log('Step 3: Provider encrypts result');
    console.log('  ciphertext length:', ciphertext.length);

    // === Step 4: Provider claims payment (reveals preimage on-chain) ===
    console.log('Step 4: Provider claims payment');

    const claimHash = await providerWallet.writeContract({
      address: ESCROW_ADDRESS,
      abi: EscrowABI,
      functionName: 'claim',
      args: [requestId, preimage],
    });

    await publicClient.waitForTransactionReceipt({ hash: claimHash });
    console.log('  Escrow.claim() tx:', claimHash);

    // Verify payment is released
    const paymentAfter = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: EscrowABI,
      functionName: 'getPayment',
      args: [requestId],
    });

    expect(paymentAfter.status).toBe(2); // Status.Released
    console.log('  Payment status: Released');

    // === Step 5: Agent decrypts content with preimage ===
    // In real flow, Agent gets preimage from PaymentReleased event
    const decrypted = decrypt(ciphertext, preimage);
    const result = JSON.parse(decrypted);

    console.log('Step 5: Agent decrypts result');
    console.log('  decrypted:', result);

    expect(result).toEqual(serviceResult);
    console.log('\n✅ E2E test passed: Full payment flow completed successfully');
  });
});
