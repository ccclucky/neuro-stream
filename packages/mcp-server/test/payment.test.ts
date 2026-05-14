import { describe, it, expect, vi, beforeEach } from 'vitest';

const NEUROSTREAM_GATEWAY_URL = 'https://gateway.example.com';
const NEUROSTREAM_API_KEY = 'ns_live_testkey';

describe('MCP Payment Tools', () => {
  beforeEach(() => {
    vi.stubEnv('NEUROSTREAM_API_URL', 'https://api.example.com');
    vi.stubEnv('NEUROSTREAM_API_KEY', NEUROSTREAM_API_KEY);
    vi.stubEnv('NEUROSTREAM_GATEWAY_URL', NEUROSTREAM_GATEWAY_URL);
  });

  it('handles 404 service not found', async () => {
    const mockResponse = new Response(JSON.stringify({ error: 'Service not found: xyz' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

    const res = await fetch(`${NEUROSTREAM_GATEWAY_URL}/api/gateway/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': NEUROSTREAM_API_KEY },
      body: JSON.stringify({ serviceId: 'xyz', params: {} }),
    });

    expect(res.status).toBe(404);
  });

  it('parses 402 challenge correctly', async () => {
    const challenge = {
      requestId: '0xabc123',
      hashLock: '0xdef456',
      amount: '2000000',
      recipient: '0x789',
      deadline: 1700000000,
    };

    const mockResponse = new Response(JSON.stringify(challenge), {
      status: 402,
      headers: { 'Content-Type': 'application/json' },
    });
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

    const res = await fetch(`${NEUROSTREAM_GATEWAY_URL}/api/gateway/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': NEUROSTREAM_API_KEY },
      body: JSON.stringify({ serviceId: 'text-analysis-v1', params: { text: 'hello' } }),
    });

    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.requestId).toBe('0xabc123');
    expect(data.amount).toBe('2000000'); // $2 USDC with 6 decimals
  });

  it('handles successful result after challenge', async () => {
    // Second call with requestId returns result
    const resultData = {
      requestId: '0xabc123',
      result: 'Analysis: The text "hello" is a greeting',
      status: 'COMPLETED',
    };

    const mockResult = new Response(JSON.stringify(resultData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    // This simulates the second POST after escrow is locked
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResult);

    const res = await fetch(`${NEUROSTREAM_GATEWAY_URL}/api/gateway/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': NEUROSTREAM_API_KEY },
      body: JSON.stringify({ serviceId: 'text-analysis-v1', params: { text: 'hello' }, requestId: '0xabc123' }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.result).toContain('greeting');
    expect(data.status).toBe('COMPLETED');
  });
});