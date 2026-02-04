import { Router } from 'express';
import { createPublicClient, createWalletClient, http, keccak256, toHex, hexToBytes, bytesToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { processStringLength } from '../services/string-length';

export interface ProviderConfig {
  escrowAddress: `0x${string}`;
  rpcUrl: string;
  providerAddress: `0x${string}`;
  providerPrivateKey: `0x${string}`;
  pricePerCall?: string;
  deadlineSeconds?: number;
}

// In-memory store for pending challenges (in production, use Redis)
const pendingChallenges = new Map<
  string,
  {
    preimage: `0x${string}`;
    hashLock: `0x${string}`;
    createdAt: number;
  }
>();

// Escrow ABI (minimal for reading payment status)
const EscrowABI = [
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
    inputs: [
      { name: 'requestId', type: 'bytes32' },
      { name: 'preimage', type: 'bytes32' },
    ],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

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

export function invokeRouter(config: ProviderConfig): Router {
  const router = Router();

  const publicClient = createPublicClient({
    transport: http(config.rpcUrl),
  });

  const pricePerCall = config.pricePerCall ?? '0.001';
  const deadlineSeconds = config.deadlineSeconds ?? 3600;

  router.post('/', async (req, res) => {
    const { text, requestId } = req.body as { text?: string; requestId?: string };

    if (!text) {
      return res.status(400).json({ error: 'Missing text parameter' });
    }

    // Case 1: No requestId - return 402 challenge
    if (!requestId) {
      const preimage = generatePreimage();
      const hashLock = computeHashLock(preimage);
      const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;

      // Store challenge for later retrieval
      pendingChallenges.set(hashLock, {
        preimage,
        hashLock,
        createdAt: Date.now(),
      });

      return res.status(402).json({
        amount: pricePerCall,
        asset: 'ETH',
        recipient: config.providerAddress,
        hashLock,
        deadline,
      });
    }

    // Case 2: Has requestId - verify payment and return encrypted result
    try {
      const payment = await publicClient.readContract({
        address: config.escrowAddress,
        abi: EscrowABI,
        functionName: 'getPayment',
        args: [requestId as `0x${string}`],
      });

      // Check payment status (1 = Locked)
      if (payment.status !== 1) {
        return res.status(400).json({
          error: 'Payment not locked',
          status: payment.status,
        });
      }

      // Verify provider address matches
      if (payment.provider.toLowerCase() !== config.providerAddress.toLowerCase()) {
        return res.status(400).json({ error: 'Provider mismatch' });
      }

      // Get stored preimage for this hashLock
      const challenge = pendingChallenges.get(payment.hashLock);
      if (!challenge) {
        return res.status(400).json({ error: 'Challenge not found or expired' });
      }

      // Process the service request
      const result = processStringLength({ text });

      // Encrypt the result with the preimage as key
      const ciphertext = encrypt(JSON.stringify(result), challenge.preimage);

      // Return encrypted result first
      res.json({
        ciphertext,
        requestId,
      });

      // Auto-claim after successful response (async, non-blocking)
      setImmediate(async () => {
        try {
          const account = privateKeyToAccount(config.providerPrivateKey);
          const walletClient = createWalletClient({
            account,
            chain: hardhat,
            transport: http(config.rpcUrl),
          });

          const claimHash = await walletClient.writeContract({
            address: config.escrowAddress,
            abi: EscrowABI,
            functionName: 'claim',
            args: [requestId as `0x${string}`, challenge.preimage],
          });

          console.log(`Auto-claimed payment for ${requestId.slice(0, 10)}...`);
          console.log(`  Transaction: ${claimHash}`);
          console.log(`  Preimage revealed: ${challenge.preimage.slice(0, 20)}...`);

          // Clean up
          pendingChallenges.delete(payment.hashLock);
        } catch (error) {
          console.error(`Failed to auto-claim for ${requestId}:`, error);
        }
      });

      return;
    } catch (error) {
      return res.status(400).json({
        error: 'Failed to verify payment',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
