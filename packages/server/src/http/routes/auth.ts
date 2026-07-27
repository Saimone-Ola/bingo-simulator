import type { FastifyPluginAsync } from 'fastify';
import { loginSchema, refreshSchema, registerSchema } from '@bingo/shared';
import { AppError } from '../../errors';
import { getSessionUser, login, logout, refresh, register } from '../../auth/service';
import type { ClientContext } from '../../auth/service';
import { parseBody } from '../validate';

function clientContext(request: {
  headers: Record<string, unknown>;
  ip: string;
}): ClientContext {
  const userAgent = request.headers['user-agent'];
  return {
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    ipAddress: request.ip,
  };
}

/**
 * Auth endpoints carry their own tighter rate limit: these are the routes a
 * credential-stuffing attempt hits first.
 */
const authRoutes: FastifyPluginAsync = async (app) => {
  const strictLimit = {
    config: {
      rateLimit: { max: 10, timeWindow: '1 minute' },
    },
  };

  app.post('/register', strictLimit, async (request, reply) => {
    const input = parseBody(registerSchema, request.body);
    const result = await register(input, clientContext(request));
    return reply.code(201).send(result);
  });

  app.post('/login', strictLimit, async (request, reply) => {
    const input = parseBody(loginSchema, request.body);
    const result = await login(input, clientContext(request));
    return reply.send(result);
  });

  app.post('/refresh', strictLimit, async (request, reply) => {
    const input = parseBody(refreshSchema, request.body);
    const result = await refresh(input.refreshToken, clientContext(request));
    return reply.send(result);
  });

  app.post('/logout', { preHandler: app.requireAuth }, async (request, reply) => {
    if (!request.auth) throw AppError.unauthorized();
    await logout(request.auth.userId, request.auth.sessionId);
    return reply.code(204).send();
  });

  app.post('/logout-all', { preHandler: app.requireAuth }, async (request, reply) => {
    if (!request.auth) throw AppError.unauthorized();
    await logout(request.auth.userId);
    return reply.code(204).send();
  });

  app.get('/me', { preHandler: app.requireAuth }, async (request, reply) => {
    if (!request.auth) throw AppError.unauthorized();
    const result = await getSessionUser(request.auth.userId, request.auth.sessionId);
    return reply.send(result);
  });
};

export default authRoutes;
