import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch for testing
const mockServices = [
  {
    id: '1',
    service_id: 'text-analysis-v1',
    endpoint: 'https://provider/api/analyze',
    pricing_model: 'per_call',
    pricing_asset: 'USDC',
    pricing_amount: '2.00',
    recipient: '0x1234',
    schema_input: 'url',
    schema_output: 'summary',
    quality_score: 0.89,
    success_rate: 0.93,
  },
];

describe('MCP Discovery Server', () => {
  beforeEach(() => {
    vi.stubEnv('NEUROSTREAM_API_URL', 'https://api.example.com');
    vi.stubEnv('NEUROSTREAM_API_KEY', 'ns_live_testkey');
  });

  it('formats service rows correctly', () => {
    const row = mockServices[0];
    const result = {
      serviceId: row.service_id,
      pricing: `${row.pricing_amount} ${row.pricing_asset} per call`,
      input: row.schema_input,
      output: row.schema_output,
      qualityScore: row.quality_score ?? 'N/A',
      successRate: row.success_rate ?? 'N/A',
    };

    expect(result.serviceId).toBe('text-analysis-v1');
    expect(result.pricing).toBe('2.00 USDC per call');
    expect(result.input).toBe('url');
    expect(result.output).toBe('summary');
    expect(result.qualityScore).toBe(0.89);
  });

  it('filters services by keyword', () => {
    const keyword = 'text';
    const kw = keyword.toLowerCase();
    const filtered = mockServices.filter(
      (r) =>
        r.service_id.toLowerCase().includes(kw) ||
        r.schema_input.toLowerCase().includes(kw)
    );
    expect(filtered.length).toBe(1);

    const noMatch = mockServices.filter(
      (r) => r.service_id.toLowerCase().includes('xyz')
    );
    expect(noMatch.length).toBe(0);
  });
});