import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EscrowClient } from '../src/escrow';

// Mock viem module
vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(),
    createWalletClient: vi.fn(),
    http: vi.fn(),
    getContract: vi.fn(),
  };
});

describe('EscrowClient', () => {
  const mockConfig = {
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`,
    rpcUrl: 'http://127.0.0.1:8545',
    escrowAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as `0x${string}`,
  };

  describe('constructor', () => {
    it('should create an EscrowClient with valid config', () => {
      const client = new EscrowClient(mockConfig);
      expect(client).toBeDefined();
    });

    it('should expose the wallet address', () => {
      const client = new EscrowClient(mockConfig);
      expect(client.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });
  });

  describe('interface', () => {
    it('should have open method', () => {
      const client = new EscrowClient(mockConfig);
      expect(typeof client.open).toBe('function');
    });

    it('should have claim method', () => {
      const client = new EscrowClient(mockConfig);
      expect(typeof client.claim).toBe('function');
    });

    it('should have refund method', () => {
      const client = new EscrowClient(mockConfig);
      expect(typeof client.refund).toBe('function');
    });

    it('should have getPayment method', () => {
      const client = new EscrowClient(mockConfig);
      expect(typeof client.getPayment).toBe('function');
    });

    it('should have waitForPaymentReleased method', () => {
      const client = new EscrowClient(mockConfig);
      expect(typeof client.waitForPaymentReleased).toBe('function');
    });
  });
});
