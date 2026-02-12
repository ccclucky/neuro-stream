-- Wallet transaction history for deposits and withdrawals
CREATE TABLE wallet_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address  TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw')),
    asset           TEXT NOT NULL CHECK (asset IN ('ETH', 'USDC')),
    amount          TEXT NOT NULL,           -- wei string
    tx_hash         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('pending', 'confirmed', 'failed')),
    from_address    TEXT,
    to_address      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wt_wallet ON wallet_transactions(wallet_address);
CREATE INDEX idx_wt_created ON wallet_transactions(created_at DESC);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all" ON wallet_transactions FOR SELECT USING (true);
CREATE POLICY "insert_all" ON wallet_transactions FOR INSERT WITH CHECK (true);
