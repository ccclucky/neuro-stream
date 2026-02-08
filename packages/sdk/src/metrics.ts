import type { CallLog } from './types';

export class MetricsReporter {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  /**
   * Report a call log for metrics aggregation.
   * Calls the NeuroStream metrics Edge Function.
   */
  async reportCallLog(log: CallLog): Promise<void> {
    const url = `${this.apiUrl}/metrics`;

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
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Failed to report metrics: ${response.status} ${response.statusText}`);
    }
  }
}
