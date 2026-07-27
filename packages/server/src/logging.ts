/**
 * Error handling helpers shared by the logger and the API error mapper.
 *
 * Drizzle wraps driver failures in a `DrizzleQueryError` whose message and
 * `params` field contain the *full bound parameter list* - which for a
 * registration means the password hash, and for other queries could mean any
 * user data at all. Logging that object verbatim would write those values to
 * disk on every failed query, so nothing here ever passes the raw error to
 * pino: it is reduced to a cause chain of trimmed messages plus the Postgres
 * error code.
 */

interface ErrorLike {
  name?: string;
  message?: string;
  code?: string | number;
  constraint_name?: string;
  constraint?: string;
  cause?: unknown;
  stack?: string;
}

const MAX_MESSAGE_LENGTH = 300;

function asErrorLike(value: unknown): ErrorLike | null {
  return typeof value === 'object' && value !== null ? (value as ErrorLike) : null;
}

/** Drops the bound-parameter dump Drizzle appends and caps the length. */
function trimMessage(message: string): string {
  const withoutParams = message.split('\nparams:')[0] ?? message;
  return withoutParams.length > MAX_MESSAGE_LENGTH
    ? `${withoutParams.slice(0, MAX_MESSAGE_LENGTH)}…`
    : withoutParams;
}

/** Stack frames only - the header line repeats the unsafe message. */
function frames(stack: string | undefined, limit = 6): string[] {
  if (!stack) return [];
  return stack
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '))
    .slice(0, limit)
    .map((line) => line.trim());
}

/** Shape pino expects from an `err` serializer, minus anything sensitive. */
export interface SanitizedError {
  [key: string]: unknown;
  type: string;
  message: string;
  /** Stack frames only; the header line would repeat the unsafe message. */
  stack: string;
  causes: string[];
  pgCode?: string;
  constraint?: string;
}

export function sanitizeError(error: unknown): SanitizedError {
  const root = asErrorLike(error);
  const causes: string[] = [];
  const seen = new Set<unknown>();

  let pgCode: string | undefined;
  let constraint: string | undefined;
  let current: unknown = root?.cause;

  while (current && !seen.has(current)) {
    seen.add(current);
    const link = asErrorLike(current);
    if (!link) break;
    if (link.message) causes.push(trimMessage(link.message));
    if (link.code !== undefined) pgCode ??= String(link.code);
    constraint ??= link.constraint_name ?? link.constraint;
    current = link.cause;
  }

  if (root?.code !== undefined) pgCode ??= String(root.code);
  constraint ??= root?.constraint_name ?? root?.constraint;

  return {
    type: root?.name ?? 'Error',
    message: trimMessage(root?.message ?? String(error)),
    stack: frames(root?.stack).join('\n'),
    causes,
    ...(pgCode ? { pgCode } : {}),
    ...(constraint ? { constraint } : {}),
  };
}

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_RESTRICT_VIOLATION = '23001';

/**
 * Walks the cause chain looking for a Postgres error with `code`. Drizzle
 * never re-exposes it on the wrapper, so a naive `error.code` check silently
 * misses every constraint violation.
 */
export function findPostgresError(
  error: unknown,
): { code: string; constraint?: string } | null {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && !seen.has(current)) {
    seen.add(current);
    const link = asErrorLike(current);
    if (!link) return null;
    if (typeof link.code === 'string' && /^\d{2}\w{3}$/.test(link.code)) {
      const constraint = link.constraint_name ?? link.constraint;
      return { code: link.code, ...(constraint ? { constraint } : {}) };
    }
    current = link.cause;
  }
  return null;
}
