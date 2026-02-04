import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { keccak256, toHex, hexToBytes, toBytes, bytesToHex } from 'viem';

/**
 * Generate a random 32-byte key for AES-256-GCM encryption
 * This key is also used as the preimage for the hashLock
 */
export function generateKey(): `0x${string}` {
  const keyBytes = randomBytes(32);
  return toHex(keyBytes);
}

/**
 * Compute hashLock = keccak256(preimage)
 * This is what gets stored on-chain in the Escrow contract
 */
export function computeHashLock(preimage: `0x${string}`): `0x${string}` {
  // Match the Solidity: keccak256(abi.encodePacked(preimage))
  return keccak256(preimage);
}

/**
 * Encrypt plaintext using AES-256-GCM
 * @param plaintext - The data to encrypt
 * @param key - 32-byte hex key (0x prefixed)
 * @returns Base64-encoded ciphertext (nonce + ciphertext + tag)
 */
export function encrypt(plaintext: string, key: `0x${string}`): string {
  const keyBytes = hexToBytes(key);
  const nonce = randomBytes(12); // 96-bit nonce for GCM
  const plaintextBytes = toBytes(plaintext);

  const cipher = gcm(keyBytes, nonce);
  const ciphertext = cipher.encrypt(plaintextBytes);

  // Combine nonce + ciphertext for transmission
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);

  // Return as base64 for easy transmission
  return Buffer.from(combined).toString('base64');
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * @param ciphertextB64 - Base64-encoded ciphertext (nonce + ciphertext + tag)
 * @param key - 32-byte hex key (0x prefixed)
 * @returns Decrypted plaintext
 */
export function decrypt(ciphertextB64: string, key: `0x${string}`): string {
  const keyBytes = hexToBytes(key);
  const combined = Buffer.from(ciphertextB64, 'base64');

  // Extract nonce (first 12 bytes) and ciphertext
  const nonce = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);

  const cipher = gcm(keyBytes, nonce);
  const plaintext = cipher.decrypt(ciphertext);

  return Buffer.from(plaintext).toString('utf-8');
}
