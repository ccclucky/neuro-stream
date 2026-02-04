import { describe, it, expect } from 'vitest';
import { generateKey, computeHashLock, encrypt, decrypt } from '../src/crypto';

describe('crypto', () => {
  describe('generateKey()', () => {
    it('should generate a 32-byte key', () => {
      const key = generateKey();
      // hex string: 0x + 64 hex chars = 32 bytes
      expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should generate unique keys', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      expect(key1).not.toEqual(key2);
    });
  });

  describe('computeHashLock()', () => {
    it('should compute keccak256 hash of preimage', () => {
      const preimage = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const hash = computeHashLock(preimage as `0x${string}`);
      // Should be a 32-byte hex string
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should produce deterministic output', () => {
      const preimage = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      const hash1 = computeHashLock(preimage as `0x${string}`);
      const hash2 = computeHashLock(preimage as `0x${string}`);
      expect(hash1).toEqual(hash2);
    });

    it('should produce different hashes for different preimages', () => {
      const preimage1 = '0x1111111111111111111111111111111111111111111111111111111111111111';
      const preimage2 = '0x2222222222222222222222222222222222222222222222222222222222222222';
      const hash1 = computeHashLock(preimage1 as `0x${string}`);
      const hash2 = computeHashLock(preimage2 as `0x${string}`);
      expect(hash1).not.toEqual(hash2);
    });
  });

  describe('encrypt() / decrypt()', () => {
    it('should roundtrip encrypt and decrypt text', () => {
      const key = generateKey();
      const plaintext = 'Hello, NeuroStream!';
      const ciphertext = encrypt(plaintext, key as `0x${string}`);
      const decrypted = decrypt(ciphertext, key as `0x${string}`);
      expect(decrypted).toEqual(plaintext);
    });

    it('should roundtrip encrypt and decrypt JSON', () => {
      const key = generateKey();
      const data = JSON.stringify({ result: 42, message: 'success' });
      const ciphertext = encrypt(data, key as `0x${string}`);
      const decrypted = decrypt(ciphertext, key as `0x${string}`);
      expect(JSON.parse(decrypted)).toEqual({ result: 42, message: 'success' });
    });

    it('should produce different ciphertexts for same plaintext (random nonce)', () => {
      const key = generateKey();
      const plaintext = 'test data';
      const ct1 = encrypt(plaintext, key as `0x${string}`);
      const ct2 = encrypt(plaintext, key as `0x${string}`);
      expect(ct1).not.toEqual(ct2);
    });

    it('should fail to decrypt with wrong key', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      const plaintext = 'secret message';
      const ciphertext = encrypt(plaintext, key1 as `0x${string}`);
      expect(() => decrypt(ciphertext, key2 as `0x${string}`)).toThrow();
    });

    it('should handle empty string', () => {
      const key = generateKey();
      const plaintext = '';
      const ciphertext = encrypt(plaintext, key as `0x${string}`);
      const decrypted = decrypt(ciphertext, key as `0x${string}`);
      expect(decrypted).toEqual('');
    });

    it('should handle unicode text', () => {
      const key = generateKey();
      const plaintext = 'Hello 你好 こんにちは 🚀';
      const ciphertext = encrypt(plaintext, key as `0x${string}`);
      const decrypted = decrypt(ciphertext, key as `0x${string}`);
      expect(decrypted).toEqual(plaintext);
    });
  });
});
