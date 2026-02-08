import { describe, it, expect } from 'vitest';
import { MetricsReporter } from '../src/metrics';

describe('MetricsReporter', () => {
  const mockApiUrl = 'https://test.supabase.co/functions/v1';
  const mockApiKey = 'ns_live_testapikey1234567890abcdef';

  describe('constructor', () => {
    it('should create reporter with valid config', () => {
      const reporter = new MetricsReporter(mockApiUrl, mockApiKey);
      expect(reporter).toBeDefined();
    });
  });

  describe('reportCallLog()', () => {
    it('should have reportCallLog method', () => {
      const reporter = new MetricsReporter(mockApiUrl, mockApiKey);
      expect(typeof reporter.reportCallLog).toBe('function');
    });
  });
});
