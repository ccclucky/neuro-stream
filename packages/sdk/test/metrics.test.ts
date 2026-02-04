import { describe, it, expect } from 'vitest';
import { MetricsReporter } from '../src/metrics';

describe('MetricsReporter', () => {
  const mockSupabaseUrl = 'https://test.supabase.co';
  const mockSupabaseKey = 'test-anon-key';

  describe('constructor', () => {
    it('should create reporter with valid config', () => {
      const reporter = new MetricsReporter(mockSupabaseUrl, mockSupabaseKey);
      expect(reporter).toBeDefined();
    });
  });

  describe('reportCallLog()', () => {
    it('should have reportCallLog method', () => {
      const reporter = new MetricsReporter(mockSupabaseUrl, mockSupabaseKey);
      expect(typeof reporter.reportCallLog).toBe('function');
    });
  });
});
