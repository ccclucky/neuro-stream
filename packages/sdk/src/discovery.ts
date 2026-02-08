import type { ServiceWithMetrics, DiscoveryOptions } from './types';

export class DiscoveryClient {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  /**
   * Discover available services, sorted by quality score.
   * Calls the NeuroStream services Edge Function.
   */
  async discoverServices(options: DiscoveryOptions = {}): Promise<ServiceWithMetrics[]> {
    const url = new URL(`${this.apiUrl}/services`);

    if (options.type) {
      url.searchParams.set('type', options.type);
    }

    if (options.minQualityScore) {
      url.searchParams.set('minQualityScore', String(options.minQualityScore));
    }

    const response = await fetch(url.toString(), {
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Discovery failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, unknown>[];
    let services = this.mapToServiceWithMetrics(data);

    // Client-side keyword filtering (fuzzy match on serviceId and service_type)
    if (options.keyword) {
      const kw = options.keyword.toLowerCase();
      services = services.filter(
        (s) =>
          s.serviceId.toLowerCase().includes(kw) ||
          (s.schema.input && s.schema.input.toLowerCase().includes(kw)) ||
          (s.schema.output && s.schema.output.toLowerCase().includes(kw))
      );
    }

    return services;
  }

  /**
   * Get a specific service by ID
   */
  async getService(serviceId: string): Promise<ServiceWithMetrics | null> {
    const url = `${this.apiUrl}/services/${encodeURIComponent(serviceId)}`;

    const response = await fetch(url, {
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Get service failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return this.mapToServiceWithMetrics([data])[0] ?? null;
  }

  private mapToServiceWithMetrics(data: unknown[]): ServiceWithMetrics[] {
    return (data as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      serviceId: row.service_id as string,
      endpoint: row.endpoint as string,
      pricing: {
        model: (row.pricing_model as 'per_call' | 'per_token' | 'per_minute') || 'per_call',
        asset: (row.pricing_asset as string) || 'ETH',
        amount: (row.pricing_amount as string) || '0',
      },
      recipient: row.recipient as `0x${string}`,
      schema: {
        input: (row.schema_input as string) || '',
        output: (row.schema_output as string) || '',
      },
      metrics: row.quality_score
        ? {
            serviceId: row.service_id as string,
            successRate: row.success_rate as number,
            avgLatency: row.avg_latency as number,
            schemaMatchRate: row.schema_match_rate as number,
            qualityScore: row.quality_score as number,
            totalCalls: row.total_calls as number,
          }
        : undefined,
    }));
  }
}
