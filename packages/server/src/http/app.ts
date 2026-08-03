import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { sql as raw } from 'drizzle-orm';
import type { ApiErrorBody } from '@bingo/shared';
import { env } from '../env';
import { db } from '../db/client';
import { AppError, isAppError } from '../errors';
import { sanitizeError } from '../logging';
import authRoutes from './routes/auth';
import walletRoutes from './routes/wallet';
import avatarRoutes from './routes/avatar';

const VERCEL_PROJECT_HOST =
  /^bingo-simulator-client-[a-z0-9-]+-saimone-olas-projects\.vercel\.app$/;

function isAllowedClientOrigin(origin: string): boolean {
  if (env.clientOrigins.includes(origin)) return true;

  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && VERCEL_PROJECT_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * The REST API, mounted into the Colyseus process.
 *
 * This is an Express app rather than a standalone Fastify server for a
 * deployment reason, not a taste one: Colyseus binds its matchmaking routes to
 * whatever HTTP server it is given and answers *every* request on it, unless
 * there is an Express app to delegate the unmatched ones to. Handing it this
 * app is what lets the API, the matchmaking endpoints and the WebSocket
 * upgrade all share a single port - which is all a PaaS gives you per service.
 */
export function mountApi(app: Application): Application {
  // Trust the platform proxy so `req.ip` is the client, not the load balancer:
  // the rate limiter keys on it.
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '64kb' }));

  app.use(
    cors({
      origin: (origin, callback) => {
        // Requests without an Origin header are server-to-server or health
        // checks. Browser requests must match an explicitly configured origin
        // or one of this project's Vercel production/preview hostnames.
        if (!origin || isAllowedClientOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    }),
  );

  // Global backstop. Individual routers tighten this.
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: (request: Request) => request.auth?.userId ?? request.ip ?? 'unknown',
      handler: (_request, response) => {
        const body: ApiErrorBody = {
          error: { code: 'rate_limited', message: 'Too many requests' },
        };
        response.status(429).json(body);
      },
    }),
  );

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/health/db', (_request, response) => {
    db.execute(raw`select 1`)
      .then(() => response.json({ status: 'ok' }))
      .catch((error: unknown) => {
        console.error('Database health check failed', sanitizeError(error));
        response.status(503).json({ status: 'unavailable' });
      });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/avatar', avatarRoutes);

  app.use('/api', (_request, response) => {
    const body: ApiErrorBody = { error: { code: 'not_found', message: 'Route not found' } };
    response.status(404).json(body);
  });

  /**
   * One place decides what a client is allowed to learn about a failure.
   * Unknown errors are logged through the sanitiser - Drizzle attaches the
   * bound parameters of a failed query, which would put password hashes in the
   * log - and answered with a generic 500.
   */
  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (isAppError(error)) {
      const body: ApiErrorBody = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        },
      };
      response.status(error.statusCode).json(body);
      return;
    }

    console.error('Unhandled error', sanitizeError(error));
    const fallback = AppError.internal();
    const body: ApiErrorBody = {
      error: { code: fallback.code, message: fallback.message },
    };
    response.status(500).json(body);
  });

  return app;
}
