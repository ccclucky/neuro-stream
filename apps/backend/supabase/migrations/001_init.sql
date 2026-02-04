-- NeuroStream Database Schema
-- Migration: 001_init.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Providers table
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT NOT NULL UNIQUE,
    name TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Services table
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
    service_id TEXT NOT NULL UNIQUE,
    service_type TEXT,
    endpoint TEXT NOT NULL,
    pricing_model TEXT DEFAULT 'per_call',
    pricing_asset TEXT DEFAULT 'ETH',
    pricing_amount TEXT DEFAULT '0.001',
    recipient TEXT NOT NULL,
    schema_input TEXT,
    schema_output TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call logs table (for metrics aggregation)
CREATE TABLE call_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    agent_address TEXT NOT NULL,
    success BOOLEAN NOT NULL DEFAULT true,
    latency_ms INTEGER NOT NULL,
    schema_match BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Metrics table (aggregated from call_logs)
CREATE TABLE metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id TEXT NOT NULL UNIQUE,
    success_rate NUMERIC(5,4) DEFAULT 0,
    avg_latency NUMERIC(10,2) DEFAULT 0,
    schema_match_rate NUMERIC(5,4) DEFAULT 0,
    quality_score NUMERIC(5,4) DEFAULT 0,
    total_calls INTEGER DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX idx_call_logs_service_id ON call_logs(service_id);
CREATE INDEX idx_call_logs_created_at ON call_logs(created_at);
CREATE INDEX idx_services_service_type ON services(service_type);
CREATE INDEX idx_metrics_quality_score ON metrics(quality_score DESC);

-- View for services with metrics (for discovery API)
CREATE VIEW services_with_metrics AS
SELECT
    s.id,
    s.service_id,
    s.service_type,
    s.endpoint,
    s.pricing_model,
    s.pricing_asset,
    s.pricing_amount,
    s.recipient,
    s.schema_input,
    s.schema_output,
    s.status,
    COALESCE(m.success_rate, 0) as success_rate,
    COALESCE(m.avg_latency, 0) as avg_latency,
    COALESCE(m.schema_match_rate, 0) as schema_match_rate,
    COALESCE(m.quality_score, 0) as quality_score,
    COALESCE(m.total_calls, 0) as total_calls
FROM services s
LEFT JOIN metrics m ON s.service_id = m.service_id
WHERE s.status = 'active';

-- Function to update metrics from call_logs
CREATE OR REPLACE FUNCTION update_service_metrics(p_service_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_success_rate NUMERIC;
    v_avg_latency NUMERIC;
    v_schema_match_rate NUMERIC;
    v_quality_score NUMERIC;
    v_total_calls INTEGER;
BEGIN
    -- Calculate metrics from recent call logs (last 30 days)
    SELECT
        COUNT(*)::NUMERIC / NULLIF(COUNT(*), 0) AS success_rate,
        AVG(latency_ms) AS avg_latency,
        SUM(CASE WHEN schema_match THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) AS schema_match_rate,
        COUNT(*) AS total_calls
    INTO
        v_success_rate,
        v_avg_latency,
        v_schema_match_rate,
        v_total_calls
    FROM call_logs
    WHERE service_id = p_service_id
    AND created_at > NOW() - INTERVAL '30 days';

    -- Calculate success rate properly
    SELECT
        SUM(CASE WHEN success THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0)
    INTO v_success_rate
    FROM call_logs
    WHERE service_id = p_service_id
    AND created_at > NOW() - INTERVAL '30 days';

    -- Calculate quality score (weighted average)
    -- 0.4 * success_rate + 0.3 * (1 - normalized_latency) + 0.3 * schema_match_rate
    -- Normalize latency: assume 1000ms is "bad" (0) and 100ms is "good" (1)
    v_quality_score := COALESCE(
        0.4 * COALESCE(v_success_rate, 0) +
        0.3 * GREATEST(0, LEAST(1, (1000 - COALESCE(v_avg_latency, 500)) / 900.0)) +
        0.3 * COALESCE(v_schema_match_rate, 0),
        0
    );

    -- Upsert metrics
    INSERT INTO metrics (service_id, success_rate, avg_latency, schema_match_rate, quality_score, total_calls, last_updated)
    VALUES (p_service_id,
            COALESCE(v_success_rate, 0),
            COALESCE(v_avg_latency, 0),
            COALESCE(v_schema_match_rate, 0),
            v_quality_score,
            COALESCE(v_total_calls, 0),
            NOW())
    ON CONFLICT (service_id)
    DO UPDATE SET
        success_rate = EXCLUDED.success_rate,
        avg_latency = EXCLUDED.avg_latency,
        schema_match_rate = EXCLUDED.schema_match_rate,
        quality_score = EXCLUDED.quality_score,
        total_calls = EXCLUDED.total_calls,
        last_updated = NOW();
END;
$$ LANGUAGE plpgsql;

-- Trigger to update metrics after each call log insert
CREATE OR REPLACE FUNCTION trigger_update_metrics()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM update_service_metrics(NEW.service_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER call_log_insert_trigger
AFTER INSERT ON call_logs
FOR EACH ROW
EXECUTE FUNCTION trigger_update_metrics();

-- Row Level Security policies
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;

-- Allow public read access to services and metrics
CREATE POLICY "Public can view active services" ON services
    FOR SELECT USING (status = 'active');

CREATE POLICY "Public can view metrics" ON metrics
    FOR SELECT USING (true);

-- Allow authenticated users to insert call logs
CREATE POLICY "Authenticated users can insert call logs" ON call_logs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Public can view call logs" ON call_logs
    FOR SELECT USING (true);

-- Provider policies
CREATE POLICY "Providers can manage their own services" ON services
    FOR ALL USING (
        provider_id IN (
            SELECT id FROM providers WHERE wallet_address = current_setting('request.jwt.claims', true)::json->>'sub'
        )
    );
