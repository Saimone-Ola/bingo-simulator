import { matchMaker } from 'colyseus';
import { env } from '../env';

const VERCEL_PROJECT_HOST =
  /^bingo-simulator-client-[a-z0-9-]+-saimone-olas-projects\\.vercel\\.app$/;

function isAllowed(origin: string, configured: Set<string>): boolean {
  if (configured.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && VERCEL_PROJECT_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Colyseus answers its own matchmaking preflights before Express. Mirror the
 * REST policy here so production and preview deployments behave identically.
 */
export function configureRealtimeCors(): void {
  const allowed = new Set(env.clientOrigins);

  matchMaker.controller.getCorsHeaders = function getCorsHeaders(
    headers: Headers,
  ): Record<string, string> {
    const origin = headers.get('origin') ?? '';

    if (allowed.size === 0) {
      return { 'Access-Control-Allow-Origin': origin || '*' };
    }

    if (isAllowed(origin, allowed)) {
      return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
    }

    return { 'Access-Control-Allow-Origin': '', Vary: 'Origin' };
  };
}
