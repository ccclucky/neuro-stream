// Service Manifest types (from PRD)
export interface ServiceManifest {
  id: string;
  serviceId: string;
  endpoint: string;
  pricing: {
    model: 'per_call' | 'per_token' | 'per_minute';
    asset: string;
    amount: string;
  };
  recipient: `0x${string}`;
  schema: {
    input: string;
    output: string;
  };
}

// Quality metrics types
export interface ServiceMetrics {
  serviceId: string;
  successRate: number;
  avgLatency: number;
  schemaMatchRate: number;
  qualityScore: number;
  totalCalls: number;
}

// Service with metrics
export interface ServiceWithMetrics extends ServiceManifest {
  metrics?: ServiceMetrics;
}

// Payment challenge from Provider (402 response)
export interface PaymentChallenge {
  amount: string;
  asset: string;
  recipient: `0x${string}`;
  hashLock: `0x${string}`;
  deadline: number;
}

// Call log for metrics reporting
export interface CallLog {
  serviceId: string;
  requestId: `0x${string}`;
  agentAddress: `0x${string}`;
  success: boolean;
  latencyMs: number;
  schemaMatch: boolean;
}

// Discovery options
export interface DiscoveryOptions {
  type?: string;
  keyword?: string;
  minQualityScore?: number;
}

// Invoke options
export interface InvokeOptions {
  timeout?: number;
  waitForClaim?: boolean;
}
