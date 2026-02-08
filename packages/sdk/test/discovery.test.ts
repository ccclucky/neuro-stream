import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscoveryClient } from '../src/discovery';

describe('DiscoveryClient', () => {
  const mockApiUrl = 'https://test.supabase.co/functions/v1';
  const mockApiKey = 'ns_live_testapikey1234567890abcdef';

  describe('constructor', () => {
    it('should create client with valid config', () => {
      const client = new DiscoveryClient(mockApiUrl, mockApiKey);
      expect(client).toBeDefined();
    });
  });

  describe('discoverServices()', () => {
    it('should have discoverServices method', () => {
      const client = new DiscoveryClient(mockApiUrl, mockApiKey);
      expect(typeof client.discoverServices).toBe('function');
    });
  });

  describe('getService()', () => {
    it('should have getService method', () => {
      const client = new DiscoveryClient(mockApiUrl, mockApiKey);
      expect(typeof client.getService).toBe('function');
    });
  });
});
