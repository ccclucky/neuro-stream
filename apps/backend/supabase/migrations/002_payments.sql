-- NeuroStream Database Schema
-- Migration: 002_payments.sql
-- Stores on-chain Escrow events indexed by the viem poller

-- payments table — stores on-chain Escrow events
CREATE TABLE payments (
    request_id TEXT PRIMARY KEY,                 -- bytes32 hex
    agent TEXT NOT NULL,                         -- address hex
    provider TEXT NOT NULL,                      -- address hex
    amount TEXT NOT NULL,                        -- uint256 as string
    hash_lock TEXT NOT NULL,                     -- bytes32 hex
    deadline BIGINT NOT NULL,                    -- uint64 block timestamp
    status TEXT NOT NULL DEFAULT 'Locked',       -- Locked | Released | Refunded
    preimage TEXT,                               -- bytes32 hex, set on Release
    tx_hash TEXT NOT NULL,                       -- transaction hash
    block_number BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT payments_status_check CHECK (status IN ('Locked', 'Released', 'Refunded'))
);

-- indexer_state table — block cursor for crash recovery
CREATE TABLE indexer_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_processed_block BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT indexer_state_singleton CHECK (id = 1)
);

-- Insert default row
INSERT INTO indexer_state (id, last_processed_block) VALUES (1, 0);

-- Indexes for common query patterns
CREATE INDEX idx_payments_agent ON payments(agent);
CREATE INDEX idx_payments_provider ON payments(provider);
CREATE INDEX idx_payments_status ON payments(status);

-- Row Level Security
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE indexer_state ENABLE ROW LEVEL SECURITY;

-- Public read access to payments
CREATE POLICY "Public can view payments" ON payments
    FOR SELECT USING (true);

-- Service role write access to payments
CREATE POLICY "Service role can insert payments" ON payments
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update payments" ON payments
    FOR UPDATE USING (true);

-- Service role access to indexer_state
CREATE POLICY "Service role can read indexer_state" ON indexer_state
    FOR SELECT USING (true);

CREATE POLICY "Service role can update indexer_state" ON indexer_state
    FOR UPDATE USING (true);
