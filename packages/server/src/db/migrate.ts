import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { env } from '../env';

/**
 * Applies every pending migration, then exits. Run against the unpooled Neon
 * endpoint - the pooler cannot hold the advisory lock the migrator relies on.
 */
const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

async function main(): Promise<void> {
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
