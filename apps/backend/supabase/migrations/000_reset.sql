-- NeuroStream Database Reset
-- WARNING: This drops ALL tables and recreates them from scratch.
-- Run via: pnpm db:reset

-- Drop all objects in reverse dependency order
DROP TRIGGER IF EXISTS call_log_insert_trigger ON call_logs;
DROP FUNCTION IF EXISTS trigger_update_metrics();
DROP FUNCTION IF EXISTS update_service_metrics(TEXT);
DROP VIEW IF EXISTS services_with_metrics;
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS indexer_state CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS call_logs CASCADE;
DROP TABLE IF EXISTS metrics CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS providers CASCADE;
