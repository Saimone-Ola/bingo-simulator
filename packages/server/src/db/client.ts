import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema';

/**
 * The game server holds long-lived WebSocket rooms and needs real transactions
 * with row locks, so it speaks the plain Postgres wire protocol (Neon's pooled
 * endpoint) rather than the HTTP driver.
 */
export const sql = postgres(env.DATABASE_URL, {
  max: env.isProduction ? 20 : 5,
  idle_timeout: 30,
  connect_timeout: 15,
  prepare: false, // required when going through a transaction pooler
  onnotice: () => {},
});

export const db = drizzle(sql, { schema, logger: env.LOG_LEVEL === 'trace' });

export type Database = typeof db;
/** The handle passed to a callback inside `db.transaction(...)`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Anything that can run a query: the pool or an open transaction. */
export type Executor = Database | Transaction;

export { schema };

export async function closeDatabase(): Promise<void> {
  await sql.end({ timeout: 5 });
}
