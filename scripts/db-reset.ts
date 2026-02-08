/**
 * scripts/db-reset.ts
 *
 * Drops all tables and recreates them from scratch.
 * Runs 000_reset.sql first, then all migration files in order.
 *
 * Usage:
 *   pnpm db:reset
 */

import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error(
      '[db-reset] SUPABASE_DB_URL is required.\n' +
        'Add it to .env.local:\n' +
        '  SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@...',
    );
    process.exit(1);
  }

  const migrationsDir = resolve(__dirname, '..', 'apps', 'backend', 'supabase', 'migrations');

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const sql = postgres(dbUrl, {
    ssl: 'prefer',
    connect_timeout: 10,
  });

  console.log('[db-reset] Resetting database...\n');

  for (const file of files) {
    const filePath = resolve(migrationsDir, file);
    const content = readFileSync(filePath, 'utf-8');
    console.log(`[db-reset] Running ${file}...`);
    try {
      await sql.unsafe(content);
      console.log(`[db-reset] ✓ ${file}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[db-reset] ✗ ${file}: ${msg}`);
      await sql.end();
      process.exit(1);
    }
  }

  // Notify PostgREST to reload schema cache
  console.log('[db-reset] Reloading PostgREST schema cache...');
  await sql.unsafe(`NOTIFY pgrst, 'reload schema'`);
  console.log('[db-reset] ✓ Schema cache reloaded');

  await sql.end();
  console.log('\n[db-reset] Done. Database has been reset.');
}

main();
