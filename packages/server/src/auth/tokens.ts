import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { AccessTokenClaims, UserRole } from '@bingo/shared';
import { env } from '../env';
import { AppError } from '../errors';

const ISSUER = 'bingo-simulator';
const AUDIENCE = 'bingo-simulator-client';

const accessKey = new TextEncoder().encode(env.AUTH_ACCESS_SECRET);

/**
 * Access tokens are short-lived signed JWTs; refresh tokens are opaque random
 * strings kept in `auth_sessions` as an HMAC digest. Nothing in the database
 * can be replayed as a credential, and nothing in the JWT is a secret.
 */

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: claims.role, sid: claims.sid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + env.AUTH_ACCESS_TTL_SECONDS)
    .setJti(randomUUID())
    .sign(accessKey);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, accessKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });

    const { sub, role, sid } = payload as { sub?: string; role?: UserRole; sid?: string };
    if (!sub || !role || !sid) {
      throw AppError.unauthorized('Malformed access token');
    }
    return { sub, role, sid };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.sessionExpired('Access token is invalid or expired');
  }
}

/** Opaque, high-entropy, never stored in the clear. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/**
 * Peppered digest: even a full database dump does not yield usable refresh
 * tokens without AUTH_REFRESH_SECRET, which never touches the database.
 */
export function hashRefreshToken(token: string): string {
  return createHmac('sha256', env.AUTH_REFRESH_SECRET).update(token).digest('hex');
}

export function refreshTokenMatches(token: string, storedHash: string): boolean {
  const computed = Buffer.from(hashRefreshToken(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}

export function refreshTokenExpiry(from = new Date()): Date {
  return new Date(from.getTime() + env.AUTH_REFRESH_TTL_SECONDS * 1000);
}
