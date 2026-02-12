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
    tokenAddress: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as `0x${string}`,
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

    it('should fallback to MONAD_RPC_URL env if rpcUrl not provided', () => {
      process.env.MONAD_RPC_URL = 'http://env-rpc:8545';
      process.env.ESCROW_CONTRACT_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
      process.env.PAYMENT_TOKEN_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
      const client = new EscrowClient({
        privateKey: mockConfig.privateKey,
      });
      expect(client).toBeDefined();
      delete process.env.MONAD_RPC_URL;
      delete process.env.ESCROW_CONTRACT_ADDRESS;
      delete process.env.PAYMENT_TOKEN_ADDRESS;
    });

    it('should throw if rpcUrl missing and no env', () => {
      const origRpc = process.env.MONAD_RPC_URL;
      const origEscrow = process.env.ESCROW_CONTRACT_ADDRESS;
      delete process.env.MONAD_RPC_URL;
      delete process.env.ESCROW_CONTRACT_ADDRESS;
      expect(() => new EscrowClient({ privateKey: mockConfig.privateKey }))
        .toThrow('rpcUrl is required');
      process.env.MONAD_RPC_URL = origRpc;
      process.env.ESCROW_CONTRACT_ADDRESS = origEscrow;
    });

    it('should throw if escrowAddress missing and no env', () => {
      const origEscrow = process.env.ESCROW_CONTRACT_ADDRESS;
      delete process.env.ESCROW_CONTRACT_ADDRESS;
      expect(() => new EscrowClient({
        privateKey: mockConfig.privateKey,
        rpcUrl: 'http://127.0.0.1:8545',
      })).toThrow('escrowAddress is required');
      process.env.ESCROW_CONTRACT_ADDRESS = origEscrow;
    });

    it('should fallback to PAYMENT_TOKEN_ADDRESS env if tokenAddress not provided', () => {
      process.env.PAYMENT_TOKEN_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
      const client = new EscrowClient({
        privateKey: mockConfig.privateKey,
        rpcUrl: mockConfig.rpcUrl,
        escrowAddress: mockConfig.escrowAddress,
      });
      expect(client).toBeDefined();
      delete process.env.PAYMENT_TOKEN_ADDRESS;
    });

    it('should throw if tokenAddress missing and no env', () => {
      const origToken = process.env.PAYMENT_TOKEN_ADDRESS;
      delete process.env.PAYMENT_TOKEN_ADDRESS;
      expect(() => new EscrowClient({
        privateKey: mockConfig.privateKey,
        rpcUrl: mockConfig.rpcUrl,
        escrowAddress: mockConfig.escrowAddress,
      })).toThrow('tokenAddress is required');
      process.env.PAYMENT_TOKEN_ADDRESS = origToken;
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
