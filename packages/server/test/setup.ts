/**
 * Test bootstrap. Supplies the secrets every suite needs so unit tests can run
 * without a .env, and points the database at TEST_DATABASE_URL when present.
 *
 * Suites that need a real database check `hasTestDatabase` and skip otherwise,
 * so `pnpm test` is always runnable on a clean checkout.
 */
process.env.NODE_ENV ??= 'test';
process.env.AUTH_ACCESS_SECRET ??= 'test-access-secret-0123456789abcdef0123456789abcdef';
process.env.AUTH_REFRESH_SECRET ??= 'test-refresh-secret-fedcba9876543210fedcba9876543210';
process.env.LOG_LEVEL ??= 'error';

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
process.env.DATABASE_URL = testDatabaseUrl ?? 'postgresql://placeholder/placeholder';

export const hasTestDatabase = Boolean(testDatabaseUrl);
