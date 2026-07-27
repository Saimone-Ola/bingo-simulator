#!/usr/bin/env node
import { randomBytes } from 'node:crypto';

/**
 * Prints the two JWT signing secrets the server needs.
 *
 * Exists because the obvious instruction - `openssl rand -hex 48` - is not
 * available on a stock Windows box, and Node is already a hard requirement.
 * The two secrets must differ: a leaked access secret must not also allow
 * minting refresh tokens.
 */
const secret = () => randomBytes(48).toString('hex');

console.log('# Copy these into packages/server/.env');
console.log(`AUTH_ACCESS_SECRET="${secret()}"`);
console.log(`AUTH_REFRESH_SECRET="${secret()}"`);
