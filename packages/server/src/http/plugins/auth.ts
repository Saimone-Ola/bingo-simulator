import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { UserRole } from '@bingo/shared';
import { AppError } from '../../errors';
import { verifyAccessToken } from '../../auth/tokens';

export interface AuthContext {
  userId: string;
  role: UserRole;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
  interface FastifyInstance {
    /** Route `preHandler` that rejects anonymous requests. */
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Route `preHandler` factory that also demands one of `roles`. */
    requireRole: (
      ...roles: UserRole[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function readBearer(request: FastifyRequest): string {
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
export default fp(async (app) => {
  app.decorateRequest('auth', undefined);

  app.decorate('requireAuth', async (request: FastifyRequest) => {
    const claims = await verifyAccessToken(readBearer(request));
    request.auth = { userId: claims.sub, role: claims.role, sessionId: claims.sid };
  });

  app.decorate('requireRole', (...roles: UserRole[]) => {
    return async (request: FastifyRequest) => {
      const claims = await verifyAccessToken(readBearer(request));
      if (!roles.includes(claims.role)) {
        throw AppError.forbidden('Insufficient role');
      }
      request.auth = { userId: claims.sub, role: claims.role, sessionId: claims.sid };
    };
  });
});
