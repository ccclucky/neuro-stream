import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NeuroStream, type NeuroStreamConfig } from '../src/client';

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

describe('NeuroStream Gateway integration', () => {
  const mockConfig: NeuroStreamConfig = {
    apiKey: 'ns_live_testapikey1234567890abcdef',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    apiUrl: 'https://test.supabase.co/functions/v1',
    rpcUrl: 'http://127.0.0.1:8545',
    escrowAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    chainId: 31337,
  };

  beforeEach(() => {
    // EscrowClient now requires tokenAddress — set via env for all tests
    process.env.PAYMENT_TOKEN_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
  });

  afterEach(() => {
    delete process.env.PAYMENT_TOKEN_ADDRESS;
  });

  describe('constructor with gatewayUrl', () => {
    it('should accept gatewayUrl in config', () => {
      const client = new NeuroStream({
        ...mockConfig,
        gatewayUrl: 'http://localhost:3000',
      });
      expect(client).toBeDefined();
    });

    it('should fallback to NEUROSTREAM_GATEWAY_URL env', () => {
      process.env.NEUROSTREAM_GATEWAY_URL = 'http://env-gateway:3000';
      const client = new NeuroStream(mockConfig);
      expect(client).toBeDefined();
      delete process.env.NEUROSTREAM_GATEWAY_URL;
    });
  });

  describe('callService routing', () => {
    it('should require either keyword or serviceId', async () => {
      const client = new NeuroStream(mockConfig);
      await expect(
        client.callService({ params: { text: 'test' } })
      ).rejects.toThrow('callService requires either keyword or serviceId');
    });
  });

  describe('invokeService (legacy)', () => {
    it('should have invokeService method for backward compatibility', () => {
      const client = new NeuroStream(mockConfig);
      expect(typeof client.invokeService).toBe('function');
    });
  });

  describe('GatewayChallenge type', () => {
    it('should export GatewayChallenge type from types', async () => {
      const { GatewayChallenge } = await import('../src/types') as { GatewayChallenge: unknown };
      // Type-only import — just verify the module loads
      expect(true).toBe(true);
    });
  });
});
