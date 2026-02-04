import type { ServiceWithMetrics, DiscoveryOptions } from './types';

export class DiscoveryClient {
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
  }

  /**
   * Discover available services, sorted by quality score
   */
  async discoverServices(options: DiscoveryOptions = {}): Promise<ServiceWithMetrics[]> {
    const url = new URL(`${this.supabaseUrl}/rest/v1/services_with_metrics`);

    // Build query params
    url.searchParams.set('select', '*');
    url.searchParams.set('order', 'quality_score.desc.nullslast');

    if (options.type) {
      url.searchParams.set('service_type', `eq.${options.type}`);
    }

    if (options.minQualityScore) {
      url.searchParams.set('quality_score', `gte.${options.minQualityScore}`);
    }

    const response = await fetch(url.toString(), {
      headers: {
        apikey: this.supabaseKey,
        Authorization: `Bearer ${this.supabaseKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Discovery failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, unknown>[];
    return this.mapToServiceWithMetrics(data);
  }

  /**
   * Get a specific service by ID
   */
  async getService(serviceId: string): Promise<ServiceWithMetrics | null> {
    const url = new URL(`${this.supabaseUrl}/rest/v1/services_with_metrics`);
    url.searchParams.set('select', '*');
    url.searchParams.set('service_id', `eq.${serviceId}`);
    url.searchParams.set('limit', '1');

    const response = await fetch(url.toString(), {
      headers: {
        apikey: this.supabaseKey,
        Authorization: `Bearer ${this.supabaseKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Get service failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as Record<string, unknown>[];
    if (data.length === 0) {
      return null;
    }

    return this.mapToServiceWithMetrics(data)[0];
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
