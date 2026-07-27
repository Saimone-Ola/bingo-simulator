import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Migrations run against the *unpooled* Neon endpoint: the pooler does not
 * support every DDL statement and we want a single stable session.
 */
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
