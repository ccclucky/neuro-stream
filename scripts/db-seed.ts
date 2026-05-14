/**
 * scripts/db-seed.ts
 *
 * Seeds the database with test data for local development:
 * - A demo provider (Hardhat account #1)
 * - A text-analysis service pointing to localhost:3001/invoke
 * - An API key for the agent (Hardhat account #2)
 *
 * Usage:
 *   pnpm db:seed
 */

import postgres from 'postgres';
import { createHash, randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Hardhat default test accounts
const PROVIDER_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Account #1
const AGENT_ADDRESS = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';   // Account #2

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error('[db-seed] SUPABASE_DB_URL is required.');
    process.exit(1);
  }

  const sql = postgres(dbUrl, { ssl: 'prefer', connect_timeout: 10 });

  console.log('[db-seed] Seeding database...\n');

  // 1. Create provider
  console.log('[db-seed] Creating demo provider...');
  const [provider] = await sql`
    INSERT INTO providers (wallet_address, name, email)
    VALUES (${PROVIDER_ADDRESS}, 'Demo Provider', 'provider@neurostream.dev')
    ON CONFLICT (wallet_address) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, wallet_address
  `;
  console.log(`  ✓ Provider: ${provider.wallet_address} (id: ${provider.id})`);

  // 2. Register service
  console.log('[db-seed] Registering text-analysis service...');
  const [service] = await sql`
    INSERT INTO services (provider_id, service_id, service_type, endpoint, pricing_model, pricing_asset, pricing_amount, recipient, schema_input, schema_output, status)
    VALUES (
      ${provider.id},
      'text-analysis-v1',
      'utility',
      'http://localhost:3001/invoke',
      'per_call',
      'USDC',
      '2.00',
      ${PROVIDER_ADDRESS},
      'JSON object with a text field for text analysis, string processing, and general utility tasks',
      'JSON object with the analysis result',
      'active'
    )
    ON CONFLICT (service_id) DO UPDATE SET
      endpoint = EXCLUDED.endpoint,
      recipient = EXCLUDED.recipient,
      schema_input = EXCLUDED.schema_input,
      schema_output = EXCLUDED.schema_output
    RETURNING service_id, endpoint
  `;
  console.log(`  ✓ Service: ${service.service_id} → ${service.endpoint}`);

  // 3. Generate API key for agent
  console.log('[db-seed] Generating API key for agent...');
  const keyRandom = randomBytes(32).toString('hex');
  const apiKey = `ns_live_${keyRandom}`;
  const keyHash = sha256(apiKey);
  const keyPrefix = apiKey.slice(0, 16);

  await sql`
    INSERT INTO api_keys (key_hash, key_prefix, wallet_address, name, is_active)
    VALUES (${keyHash}, ${keyPrefix}, ${AGENT_ADDRESS}, 'Demo Agent Key', true)
  `;
  console.log(`  ✓ API Key: ${apiKey}`);

  // Print summary
  console.log('\n[db-seed] Done! Update your .env files:\n');
  console.log('  # apps/agent/.env');
  console.log(`  NEUROSTREAM_API_KEY=${apiKey}`);
  console.log(`  NEUROSTREAM_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a`);
  console.log(`  ESCROW_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3`);
  console.log('');
  console.log('  # apps/provider/.env');
  console.log(`  PROVIDER_WALLET_ADDRESS=${PROVIDER_ADDRESS}`);
  console.log(`  PROVIDER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`);
  console.log(`  ESCROW_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3`);

  await sql.end();
}

main().catch((err) => {
  console.error('[db-seed] Error:', err.message || err);
  process.exit(1);
});
