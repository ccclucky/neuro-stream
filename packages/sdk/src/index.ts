// NeuroStream SDK - Entry point
export const VERSION = '0.0.1';

// Main client
export { NeuroStream, type NeuroStreamConfig } from './client';

// Escrow client
export {
  EscrowClient,
  PaymentStatus,
  type EscrowClientConfig,
  type Payment,
  type OpenParams,
  type PaymentReleasedEvent,
} from './escrow';

// Crypto utilities
export { generateKey, computeHashLock, encrypt, decrypt } from './crypto';

// Discovery client
export { DiscoveryClient } from './discovery';

// Metrics reporter
export { MetricsReporter } from './metrics';

// Types
export type {
  ServiceManifest,
  ServiceMetrics,
  ServiceWithMetrics,
  PaymentChallenge,
  CallLog,
  DiscoveryOptions,
  InvokeOptions,
} from './types';

// ABI
export { EscrowABI } from './abi';
