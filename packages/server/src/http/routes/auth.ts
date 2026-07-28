import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { loginSchema, refreshSchema, registerSchema } from '@bingo/shared';
import { AppError } from '../../errors';
import { getSessionUser, login, logout, refresh, register } from '../../auth/service';
import type { ClientContext } from '../../auth/service';
import { parseBody } from '../validate';
import { asyncRoute, requireAuth } from '../middleware/auth';

function clientContext(request: Request): ClientContext {
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
const strictLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      error: { code: 'rate_limited', message: 'Too many requests' },
    });
  },
});

const authRoutes: Router = Router();

authRoutes.post(
  '/register',
  strictLimit,
  asyncRoute(async (request, response) => {
    const input = parseBody(registerSchema, request.body);
    const result = await register(input, clientContext(request));
    response.status(201).json(result);
  }),
);

authRoutes.post(
  '/login',
  strictLimit,
  asyncRoute(async (request, response) => {
    const input = parseBody(loginSchema, request.body);
    response.json(await login(input, clientContext(request)));
  }),
);

authRoutes.post(
  '/refresh',
  strictLimit,
  asyncRoute(async (request, response) => {
    const input = parseBody(refreshSchema, request.body);
    response.json(await refresh(input.refreshToken, clientContext(request)));
  }),
);

authRoutes.post(
  '/logout',
  requireAuth,
  asyncRoute(async (request, response) => {
    if (!request.auth) throw AppError.unauthorized();
    await logout(request.auth.userId, request.auth.sessionId);
    response.status(204).end();
  }),
);

authRoutes.post(
  '/logout-all',
  requireAuth,
  asyncRoute(async (request, response) => {
    if (!request.auth) throw AppError.unauthorized();
    await logout(request.auth.userId);
    response.status(204).end();
  }),
);

authRoutes.get(
  '/me',
  requireAuth,
  asyncRoute(async (request, response) => {
    if (!request.auth) throw AppError.unauthorized();
    response.json(await getSessionUser(request.auth.userId, request.auth.sessionId));
  }),
);

export default authRoutes;
