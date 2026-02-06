/**
 * scripts/db-migrate.ts
 *
 * Reads all SQL migration files from apps/backend/supabase/migrations/
 * and executes them in order against the Supabase PostgreSQL database.
 *
 * Requires SUPABASE_DB_URL in environment — the full PostgreSQL connection
 * string from Supabase Dashboard → Settings → Database → Connection string.
 *
 * Usage:
 *   pnpm db:migrate
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
      '[db-migrate] SUPABASE_DB_URL is required.\n' +
        'Copy the full connection string from:\n' +
        '  Supabase Dashboard → Settings → Database → Connection string → URI\n' +
        'Add it to .env.local:\n' +
        '  SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@...',
    );
    process.exit(1);
  }

  const migrationsDir = resolve(__dirname, '..', 'apps', 'backend', 'supabase', 'migrations');

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('[db-migrate] No migration files found.');
    process.exit(0);
  }

  const sql = postgres(dbUrl, {
    ssl: 'prefer',
    connect_timeout: 10,
  });

  console.log(`[db-migrate] Found ${files.length} migration(s): ${files.join(', ')}`);

  for (const file of files) {
    const filePath = resolve(migrationsDir, file);
    const content = readFileSync(filePath, 'utf-8');
    console.log(`[db-migrate] Running ${file}...`);
    try {
      await sql.unsafe(content);
      console.log(`[db-migrate] ✓ ${file}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists')) {
        console.log(`[db-migrate] ⏭ ${file} (already applied)`);
      } else {
        console.error(`[db-migrate] ✗ ${file}: ${msg}`);
        await sql.end();
        process.exit(1);
      }
    }
  }

  await sql.end();
  console.log('[db-migrate] Done.');
}

main();
