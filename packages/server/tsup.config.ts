import { defineConfig } from 'tsup';

export default defineConfig({
  // The migrator ships alongside the server so the platform can run it as a
  // pre-deploy step against the same bundle it is about to start.
  entry: ['src/index.ts', 'src/db/migrate.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  // The workspace package ships TypeScript source, so it must be bundled in.
  // Everything else (including the native argon2 binding) stays external.
  noExternal: ['@bingo/shared'],
});
