import { matchMaker } from 'colyseus';
import { env } from '../env';
import { isAllowedClientOrigin } from '../security/clientOrigins';

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

    if (isAllowedClientOrigin(origin, [...allowed])) {
      return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
    }

    return { 'Access-Control-Allow-Origin': '', Vary: 'Origin' };
  };
}
