import 'dotenv/config';
import { z } from 'zod';

/**
 * Fail fast on misconfiguration. A server that boots with a missing JWT secret
 * is worse than a server that refuses to boot.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_URL_UNPOOLED: z.string().optional(),

  AUTH_ACCESS_SECRET: z.string().min(32, 'AUTH_ACCESS_SECRET must be at least 32 chars'),
  AUTH_REFRESH_SECRET: z.string().min(32, 'AUTH_REFRESH_SECRET must be at least 32 chars'),
  AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  AUTH_REFRESH_TTL_SECONDS: z.coerce.number().int().min(3600).default(2_592_000),

  CLIENT_ORIGINS: z.string().default('http://localhost:5173'),

  WELCOME_BONUS_CREDITS: z.coerce.number().int().min(0).default(1000),
});

function load() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const value = parsed.data;

  if (value.AUTH_ACCESS_SECRET === value.AUTH_REFRESH_SECRET) {
    throw new Error('AUTH_ACCESS_SECRET and AUTH_REFRESH_SECRET must differ');
  }

  return {
    ...value,
    isProduction: value.NODE_ENV === 'production',
    clientOrigins: value.CLIENT_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

export type Env = ReturnType<typeof load>;

export const env: Env = load();
