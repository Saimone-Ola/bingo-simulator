import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql as raw } from 'drizzle-orm';
import type { AuthResponse, LoginInput, PublicUser, RegisterInput } from '@bingo/shared';
import { db, type Executor } from '../db/client';
import { authSessions, avatars, users, wallets } from '../db/schema';
import { env } from '../env';
import { AppError } from '../errors';
import { PG_UNIQUE_VIOLATION, findPostgresError } from '../logging';
import { ensureWallet, postLedgerEntry } from '../services/ledger';
import { fakeVerifyForTiming, hashPassword, needsRehash, verifyPassword } from './password';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from './tokens';

export interface ClientContext {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

function toPublicUser(row: typeof users.$inferSelect): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    locale: row.locale,
    level: row.level,
    experience: row.experience,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Turns a duplicate-key failure into the right 409. The constraint name is the
 * only reliable signal for *which* field collided; Drizzle buries it a couple
 * of levels down in the cause chain.
 */
function asUniqueViolation(error: unknown): AppError | null {
  const pgError = findPostgresError(error);
  if (pgError?.code !== PG_UNIQUE_VIOLATION) return null;

  if (pgError.constraint?.includes('display_name')) {
    return AppError.conflict('display_name_already_used', 'Display name already taken');
  }
  return AppError.conflict('email_already_used', 'Email already registered');
}

/** Issues a fresh session row plus the token pair for it. */
async function issueSession(
  exec: Executor,
  user: typeof users.$inferSelect,
  context: ClientContext,
  familyId: string = randomUUID(),
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; sessionId: string }> {
  const refreshToken = generateRefreshToken();

  const [session] = await exec
    .insert(authSessions)
    .values({
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      familyId,
      userAgent: context.userAgent?.slice(0, 400) ?? null,
      ipAddress: context.ipAddress?.slice(0, 64) ?? null,
      expiresAt: refreshTokenExpiry(),
    })
    .returning({ id: authSessions.id });

  if (!session) throw AppError.internal('Session could not be created');

  const accessToken = await signAccessToken({
    sub: user.id,
    role: user.role,
    sid: session.id,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: env.AUTH_ACCESS_TTL_SECONDS,
    sessionId: session.id,
  };
}

/**
 * Creates the account, its wallet, its avatar and the welcome bonus in one
 * transaction: a half-registered player with no wallet must not be possible.
 */
export async function register(
  input: RegisterInput,
  context: ClientContext = {},
): Promise<AuthResponse> {
  const passwordHash = await hashPassword(input.password);

  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          locale: input.locale ?? 'it',
          ageAcknowledgedAt: new Date(),
          lastLoginAt: new Date(),
        })
        .returning();

      if (!user) throw AppError.internal('User could not be created');

      await ensureWallet(tx, user.id);
      await tx.insert(avatars).values({ userId: user.id });

      let balance = 0;
      if (env.WELCOME_BONUS_CREDITS > 0) {
        const entry = await postLedgerEntry(tx, {
          userId: user.id,
          amount: env.WELCOME_BONUS_CREDITS,
          reason: 'welcome_bonus',
          refType: 'user',
          refId: user.id,
          idempotencyKey: `welcome:${user.id}`,
        });
        balance = entry.balanceAfter;
      }

      const tokens = await issueSession(tx, user, context);

      return {
        user: toPublicUser(user),
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
        },
        balance,
      };
    });
  } catch (error) {
    const conflict = asUniqueViolation(error);
    if (conflict) throw conflict;
    throw error;
  }
}

export async function login(
  input: LoginInput,
  context: ClientContext = {},
): Promise<AuthResponse> {
  const [user] = await db
    .select()
    .from(users)
    .where(raw`lower(${users.email}) = ${input.email.toLowerCase()}`)
    .limit(1);

  if (!user) {
    // Equalise timing so a missing account is indistinguishable from a wrong
    // password, then fail with the same generic error.
    await fakeVerifyForTiming();
    throw AppError.invalidCredentials();
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) throw AppError.invalidCredentials();

  if (user.status !== 'active') {
    throw new AppError('account_suspended', 'Account is not active', 403);
  }

  return db.transaction(async (tx) => {
    if (needsRehash(user.passwordHash)) {
      await tx
        .update(users)
        .set({ passwordHash: await hashPassword(input.password) })
        .where(eq(users.id, user.id));
    }

    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const tokens = await issueSession(tx, user, context);
    const [wallet] = await tx
      .select({ balance: wallets.balance })
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .limit(1);

    return {
      user: toPublicUser(user),
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
      balance: wallet?.balance ?? 0,
    };
  });
}

/**
 * Rotating refresh. The presented token is consumed and replaced; presenting a
 * token that was already rotated means it was stolen, so the whole family is
 * revoked and the player has to sign in again.
 */
export async function refresh(
  presentedToken: string,
  context: ClientContext = {},
): Promise<AuthResponse> {
  const presentedHash = hashRefreshToken(presentedToken);

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(authSessions)
      .where(eq(authSessions.refreshTokenHash, presentedHash))
      .for('update')
      .limit(1);

    if (!session) throw AppError.sessionExpired('Refresh token not recognised');

    if (session.revokedAt || session.rotatedToId) {
      // Reuse of an already-rotated token: assume compromise.
      await tx
        .update(authSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(authSessions.familyId, session.familyId), isNull(authSessions.revokedAt)));
      throw AppError.sessionExpired('Refresh token was already used');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw AppError.sessionExpired('Refresh token expired');
    }

    const [user] = await tx.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (!user) throw AppError.sessionExpired('Account no longer exists');
    if (user.status !== 'active') {
      throw new AppError('account_suspended', 'Account is not active', 403);
    }

    const next = await issueSession(tx, user, context, session.familyId);

    await tx
      .update(authSessions)
      .set({ revokedAt: new Date(), rotatedToId: next.sessionId })
      .where(eq(authSessions.id, session.id));

    const [wallet] = await tx
      .select({ balance: wallets.balance })
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .limit(1);

    return {
      user: toPublicUser(user),
      tokens: {
        accessToken: next.accessToken,
        refreshToken: next.refreshToken,
        expiresIn: next.expiresIn,
      },
      balance: wallet?.balance ?? 0,
    };
  });
}

/** Revokes one device (`sessionId`) or every device for the user. */
export async function logout(userId: string, sessionId?: string): Promise<void> {
  const condition = sessionId
    ? and(eq(authSessions.userId, userId), eq(authSessions.id, sessionId))
    : eq(authSessions.userId, userId);

  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(condition, isNull(authSessions.revokedAt)));
}

export async function getSessionUser(
  userId: string,
  sessionId: string,
): Promise<{ user: PublicUser; balance: number }> {
  const [row] = await db
    .select({ user: users, balance: wallets.balance, revokedAt: authSessions.revokedAt })
    .from(users)
    .innerJoin(wallets, eq(wallets.userId, users.id))
    .innerJoin(
      authSessions,
      and(eq(authSessions.id, sessionId), eq(authSessions.userId, users.id)),
    )
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) throw AppError.unauthorized('Session no longer valid');
  if (row.revokedAt) throw AppError.sessionExpired('Session was revoked');
  if (row.user.status !== 'active') {
    throw new AppError('account_suspended', 'Account is not active', 403);
  }

  return { user: toPublicUser(row.user), balance: row.balance };
}
