export interface IndexerConfig {
  rpcUrl: string;
  escrowAddress: `0x${string}`;
  supabaseUrl: string;
  supabaseServiceKey: string;
  pollIntervalMs: number;
  startBlock?: bigint;
}

export type PaymentStatus = 'Locked' | 'Released' | 'Refunded';

export interface PaymentRow {
  request_id: string;
  agent: string;
  provider: string;
  amount: string;
  hash_lock: string;
  deadline: number;
  status: PaymentStatus;
  preimage: string | null;
  tx_hash: string;
  block_number: number;
  created_at?: string;
  updated_at?: string;
}

export interface IndexerState {
  id: number;
  last_processed_block: number;
  updated_at: string;
}
