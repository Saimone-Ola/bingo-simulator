import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../env';

/**
 * Applies every pending migration, then exits. Run against the unpooled
 * endpoint - a transaction pooler cannot hold the advisory lock the migrator
 * relies on.
 */

/**
 * Finds the SQL folder without assuming where this file ended up.
 *
 * In development it runs from `src/db/`, with the migrations two levels up. In
 * the built image it runs from `db/` sitting next to `drizzle/`, one level up.
 * Hardcoding either path breaks the other, and the breakage only shows at
 * deploy time - so the candidates are tried in order, and `MIGRATIONS_DIR`
 * overrides all of them.
 */
function findMigrationsFolder(): string {
  const override = process.env.MIGRATIONS_DIR;
  if (override) return resolve(override);

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../drizzle'), // bundled: /app/db -> /app/drizzle
    resolve(here, '../../drizzle'), // source: src/db -> packages/server/drizzle
    resolve(process.cwd(), 'drizzle'),
  ];

  const found = candidates.find((candidate) =>
    existsSync(resolve(candidate, 'meta/_journal.json')),
  );

  if (!found) {
    throw new Error(
      `No migrations folder found. Looked in:\n${candidates.map((c) => `  - ${c}`).join('\n')}`,
    );
  }
  return found;
}

async function main(): Promise<void> {
  const migrationsFolder = findMigrationsFolder();
  const connectionString = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  const client = postgres(connectionString, { max: 1, prepare: false });

  try {
    console.log(`Applying migrations from ${migrationsFolder}`);
    await migrate(drizzle(client), { migrationsFolder });
    console.log('Migrations applied.');
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
