import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
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
