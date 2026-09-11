import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // Database suites share a database: recovery scans all open rounds and
    // must not cancel a round another file is currently exercising.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    // Vitest 4's supported switch also forces maxWorkers to 1.
    fileParallelism: false,
  },
});
