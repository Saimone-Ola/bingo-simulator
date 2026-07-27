import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // The ledger integrity suite opens real transactions; give it room and do
    // not let other suites interleave against the same rows.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    singleFork: true,
  },
});
