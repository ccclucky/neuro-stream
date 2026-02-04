import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscoveryClient } from '../src/discovery';

describe('DiscoveryClient', () => {
  const mockSupabaseUrl = 'https://test.supabase.co';
  const mockSupabaseKey = 'test-anon-key';

  describe('constructor', () => {
    it('should create client with valid config', () => {
      const client = new DiscoveryClient(mockSupabaseUrl, mockSupabaseKey);
      expect(client).toBeDefined();
    });
  });

  describe('discoverServices()', () => {
    it('should have discoverServices method', () => {
      const client = new DiscoveryClient(mockSupabaseUrl, mockSupabaseKey);
      expect(typeof client.discoverServices).toBe('function');
    });
  });

  describe('getService()', () => {
    it('should have getService method', () => {
      const client = new DiscoveryClient(mockSupabaseUrl, mockSupabaseKey);
      expect(typeof client.getService).toBe('function');
    });
  });
});
