-- Gateway Challenges — Payment Gateway state machine
-- Tracks the lifecycle of each Agent→Gateway→Provider payment flow

CREATE TABLE gateway_challenges (
    -- Primary identifier
    request_id       TEXT PRIMARY KEY,           -- bytes32 hex
    idempotency_key  TEXT UNIQUE,                -- client-provided idempotency key

    -- Participants
    agent_address    TEXT NOT NULL,              -- Agent wallet address
    service_id       TEXT NOT NULL,              -- Service ID
    provider_endpoint TEXT NOT NULL,             -- Provider HTTP endpoint (snapshot)
    gateway_address  TEXT NOT NULL,              -- Gateway wallet address (escrow recipient)
    provider_wallet  TEXT,                       -- Provider embedded wallet (claim funds go here)

    -- Crypto material
    preimage         TEXT NOT NULL,              -- 0x... 32 bytes
    hash_lock        TEXT NOT NULL,              -- keccak256(preimage)

    -- Escrow parameters
    amount           TEXT NOT NULL,              -- Wei string
    deadline         BIGINT NOT NULL,            -- Unix timestamp

    -- State machine
    status           TEXT NOT NULL DEFAULT 'CREATED'
                     CHECK (status IN (
                         'CREATED', 'ESCROW_LOCKED', 'PROVIDER_CALLED',
                         'RESULT_STORED', 'CLAIMED', 'COMPLETED',
                         'FAILED', 'REFUNDABLE', 'REFUNDED'
                     )),

    -- Per-state timestamps (monitoring + SLA)
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    escrow_locked_at     TIMESTAMPTZ,
    provider_called_at   TIMESTAMPTZ,
    result_stored_at     TIMESTAMPTZ,
    claimed_at           TIMESTAMPTZ,
    completed_at         TIMESTAMPTZ,

    -- Provider result storage (for recovery)
    provider_result      TEXT,                   -- Provider plain-text result
    provider_http_status INTEGER,                -- Provider HTTP status code

    -- On-chain tx tracking
    claim_tx_hash        TEXT,                   -- claim() transaction hash
    claim_attempts       INTEGER NOT NULL DEFAULT 0,

    -- Error tracking
    last_error           TEXT,
    error_count          INTEGER NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX idx_gc_status ON gateway_challenges(status);
CREATE INDEX idx_gc_agent ON gateway_challenges(agent_address);
CREATE INDEX idx_gc_service ON gateway_challenges(service_id);
CREATE INDEX idx_gc_deadline ON gateway_challenges(deadline);

-- Composite index: recovery task queries
CREATE INDEX idx_gc_recovery ON gateway_challenges(status, deadline)
    WHERE status NOT IN ('COMPLETED', 'REFUNDED', 'FAILED');

-- RLS
ALTER TABLE gateway_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON gateway_challenges
    FOR ALL USING (true) WITH CHECK (true);

-- Provider revenue aggregate view
CREATE VIEW provider_revenue AS
SELECT
    service_id,
    COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_calls,
    COUNT(*) FILTER (WHERE status IN ('REFUNDED', 'REFUNDABLE')) as failed_calls,
    SUM(CASE WHEN status = 'COMPLETED' THEN amount::NUMERIC ELSE 0 END) as total_revenue_wei
FROM gateway_challenges
GROUP BY service_id;
