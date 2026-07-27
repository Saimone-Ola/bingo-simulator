import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '@bingo/shared';
import { hashPassword, needsRehash, verifyPassword } from '../src/auth/password';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenMatches,
  signAccessToken,
  verifyAccessToken,
} from '../src/auth/tokens';

describe('password hashing', () => {
  it('produces an argon2id hash that verifies', async () => {
    const hash = await hashPassword('un-cane-blu-corre-2026');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(verifyPassword(hash, 'un-cane-blu-corre-2026')).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('un-cane-blu-corre-2026');
    await expect(verifyPassword(hash, 'un-cane-blu-corre-2027')).resolves.toBe(false);
  });

  it('salts: the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([hashPassword('ripetuta-mille-volte'), hashPassword('ripetuta-mille-volte')]);
    expect(a).not.toBe(b);
  });

  it('treats a corrupted stored hash as a failed verification, not a crash', async () => {
    await expect(verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
  });

  it('does not ask for a rehash at current parameters', async () => {
    const hash = await hashPassword('parametri-correnti-ok');
    expect(needsRehash(hash)).toBe(false);
  });
});

describe('access tokens', () => {
  it('round-trips the minimal claim set', async () => {
    const token = await signAccessToken({
      sub: '11111111-1111-4111-8111-111111111111',
      role: 'player',
      sid: '22222222-2222-4222-8222-222222222222',
    });

    const claims = await verifyAccessToken(token);
    expect(claims.sub).toBe('11111111-1111-4111-8111-111111111111');
    expect(claims.role).toBe('player');
    expect(claims.sid).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('rejects a tampered token', async () => {
    const token = await signAccessToken({
      sub: '11111111-1111-4111-8111-111111111111',
      role: 'player',
      sid: '22222222-2222-4222-8222-222222222222',
    });

    const [header, payload, signature] = token.split('.');
    const forged = JSON.stringify({
      sub: '11111111-1111-4111-8111-111111111111',
      role: 'admin',
      sid: '22222222-2222-4222-8222-222222222222',
    });
    const tampered = `${header}.${Buffer.from(forged).toString('base64url')}.${signature}`;
    expect(tampered).not.toBe(payload);

    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });

  it('rejects arbitrary strings', async () => {
    await expect(verifyAccessToken('definitely.not.a.jwt')).rejects.toThrow();
  });
});

describe('refresh tokens', () => {
  it('never stores the token itself', () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
  });

  it('matches only the token it was derived from', () => {
    const token = generateRefreshToken();
    const other = generateRefreshToken();
    const hash = hashRefreshToken(token);

    expect(refreshTokenMatches(token, hash)).toBe(true);
    expect(refreshTokenMatches(other, hash)).toBe(false);
  });
});

describe('registration contract', () => {
  it('accepts a well formed payload', () => {
    const parsed = registerSchema.safeParse({
      email: '  Mario.Rossi@Example.com ',
      password: 'una-password-lunga-2026',
      displayName: 'Mario Rossi',
      ageAcknowledged: true,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe('mario.rossi@example.com');
  });

  it('refuses short passwords', () => {
    const parsed = registerSchema.safeParse({
      email: 'mario@example.com',
      password: 'corta',
      displayName: 'Mario',
      ageAcknowledged: true,
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses registration without the age acknowledgement', () => {
    const parsed = registerSchema.safeParse({
      email: 'mario@example.com',
      password: 'una-password-lunga-2026',
      displayName: 'Mario',
      ageAcknowledged: false,
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses display names with control or markup characters', () => {
    for (const displayName of ['<script>', 'a', 'nome\ncattivo', '   ']) {
      expect(registerSchema.safeParse({
        email: 'mario@example.com',
        password: 'una-password-lunga-2026',
        displayName,
        ageAcknowledged: true,
      }).success).toBe(false);
    }
  });

  it('does not silently accept an empty login password', () => {
    expect(loginSchema.safeParse({ email: 'mario@example.com', password: '' }).success).toBe(false);
  });
});
