-- API Keys table for SDK authentication
-- Stores hashed keys (SHA-256), never plaintext
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash TEXT NOT NULL UNIQUE,       -- SHA-256(full_key)
    key_prefix TEXT NOT NULL,            -- first 16 chars for display (ns_live_ab12...)
    wallet_address TEXT NOT NULL,        -- bound Privy wallet address
    name TEXT DEFAULT 'Default',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_wallet_address ON api_keys(wallet_address);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Service role has full access (Edge Functions use service role)
CREATE POLICY "Service role full access" ON api_keys
    FOR ALL USING (true) WITH CHECK (true);
