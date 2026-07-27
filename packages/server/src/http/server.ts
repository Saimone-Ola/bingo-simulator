import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { sql as raw } from 'drizzle-orm';
import type { ApiErrorBody } from '@bingo/shared';
import { env } from '../env';
import { db } from '../db/client';
import { AppError, isAppError } from '../errors';
import { sanitizeError } from '../logging';
import authPlugin from './plugins/auth';
import authRoutes from './routes/auth';
import walletRoutes from './routes/wallet';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.refreshToken'],
      serializers: {
        // Never let a driver error reach the log verbatim: Drizzle attaches the
        // bound parameters of the failed query, which can include password
        // hashes and other user data.
        err: sanitizeError,
      },
    },
    trustProxy: true,
    bodyLimit: 64 * 1024,
  });

  await app.register(cors, {
    origin: env.clientOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  // Global backstop. Individual routes tighten this via `config.rateLimit`.
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.auth?.userId ?? request.ip,
  });

  await app.register(authPlugin);

  app.setNotFoundHandler((_request, reply) => {
    const body: ApiErrorBody = {
      error: { code: 'not_found', message: 'Route not found' },
    };
    return reply.code(404).send(body);
  });

  /**
   * One place decides what a client is allowed to learn about a failure.
   * Unknown errors are logged in full and answered with a generic 500.
   */
  app.setErrorHandler((error, request, reply) => {
    if (isAppError(error)) {
      const body: ApiErrorBody = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        },
      };
      return reply.code(error.statusCode).send(body);
    }

    if ((error as { statusCode?: number }).statusCode === 429) {
      const body: ApiErrorBody = {
        error: { code: 'rate_limited', message: 'Too many requests' },
      };
      return reply.code(429).send(body);
    }

    request.log.error({ err: error }, 'Unhandled error');
    const fallback = AppError.internal();
    const body: ApiErrorBody = {
      error: { code: fallback.code, message: fallback.message },
    };
    return reply.code(500).send(body);
  });

  app.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  app.get('/health/db', async (_request, reply) => {
    try {
      await db.execute(raw`select 1`);
      return { status: 'ok' };
    } catch (error) {
      _request.log.error({ err: error }, 'Database health check failed');
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(walletRoutes, { prefix: '/api/wallet' });

  return app;
}
