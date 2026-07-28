#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Writes `dist/package.json` describing exactly what the built server needs at
 * runtime.
 *
 * The bundle already inlines `@bingo/shared`, so the runtime tree must not
 * contain a `workspace:*` dependency - there is no workspace in the runtime
 * image to resolve it against, and a plain `npm install` would fail on it.
 * Everything else stays external (argon2 is a native binding, and bundling the
 * rest buys nothing).
 *
 * Emitting a manifest rather than copying `node_modules` from the build stage
 * is what keeps dev dependencies - tsup, vitest, drizzle-kit, the whole
 * TypeScript toolchain - out of the image.
 */
const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8'));

const dependencies = Object.fromEntries(
  Object.entries(source.dependencies ?? {}).filter(
    ([, version]) => !String(version).startsWith('workspace:'),
  ),
);

const manifest = {
  name: 'bingo-server-runtime',
  version: source.version,
  private: true,
  type: 'module',
  main: 'index.js',
  engines: source.engines ?? { node: '>=22' },
  dependencies,
};

const target = resolve(here, '../dist/package.json');
writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Runtime manifest written to ${target}`);
console.log(`  ${Object.keys(dependencies).length} runtime dependencies`);
