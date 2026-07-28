import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@bingo/shared';
import { AppError } from '../../errors';
import { verifyAccessToken } from '../../auth/tokens';

export interface AuthContext {
  userId: string;
  role: UserRole;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function readBearer(request: Request): string {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw AppError.unauthorized('Missing bearer token');
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) throw AppError.unauthorized('Missing bearer token');
  return token;
}

/**
 * Authentication is a request-scoped fact derived from a signed token only.
 * Nothing here ever trusts a body field, a query parameter or a header other
 * than Authorization.
 */
export function requireAuth(request: Request, _response: Response, next: NextFunction): void {
  verifyAccessToken(readBearer(request))
    .then((claims) => {
      request.auth = { userId: claims.sub, role: claims.role, sessionId: claims.sid };
      next();
    })
    .catch(next);
}

/** Same, but also demands one of `roles`. */
export function requireRole(...roles: UserRole[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    verifyAccessToken(readBearer(request))
      .then((claims) => {
        if (!roles.includes(claims.role)) throw AppError.forbidden('Insufficient role');
        request.auth = { userId: claims.sub, role: claims.role, sessionId: claims.sid };
        next();
      })
      .catch(next);
  };
}

/**
 * Express 5 forwards a rejected promise from an async handler to `next`, but
 * only for handlers it awaits. Wrapping keeps that behaviour explicit and
 * uniform across every route.
 */
export function asyncRoute(
  handler: (request: Request, response: Response) => Promise<unknown>,
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    handler(request, response).catch(next);
  };
}
