import type { CallLog } from './types';

export class MetricsReporter {
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
  }

  /**
   * Report a call log for metrics aggregation
   */
  async reportCallLog(log: CallLog): Promise<void> {
    const url = `${this.supabaseUrl}/rest/v1/call_logs`;

    const body = {
      service_id: log.serviceId,
      request_id: log.requestId,
      agent_address: log.agentAddress,
      success: log.success,
      latency_ms: log.latencyMs,
      schema_match: log.schemaMatch,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: this.supabaseKey,
        Authorization: `Bearer ${this.supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to report metrics: ${response.status} ${response.statusText}`);
    }
  }
}
