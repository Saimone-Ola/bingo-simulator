import { matchMaker } from 'colyseus';
import { env } from '../env';

/**
 * Locks down the CORS headers Colyseus sends.
 *
 * This is not decorative. Colyseus prepends its own `request` listener to the
 * HTTP server, and that listener answers *every* OPTIONS preflight itself -
 * before Express, and therefore before the `cors` middleware - using
 * `DEFAULT_CORS_HEADERS`. Those defaults are
 * `Access-Control-Allow-Origin: *` together with
 * `Access-Control-Allow-Credentials: true`, which reflects any origin that
 * asks. Sharing one port with the API means the API inherits that.
 *
 * Overriding `getCorsHeaders` is the documented way to change it, and it is
 * the only thing that reaches the preflight path.
 */
export function configureRealtimeCors(): void {
  const allowed = new Set(env.clientOrigins);

  matchMaker.controller.getCorsHeaders = function getCorsHeaders(
    headers: Headers,
  ): Record<string, string> {
    const origin = headers.get('origin') ?? '';

    // No configured list means development: reflect whatever asked. In
    // production `CLIENT_ORIGINS` is set, so this branch never runs there.
    if (allowed.size === 0) {
      return { 'Access-Control-Allow-Origin': origin || '*' };
    }

    if (allowed.has(origin)) {
      return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
    }

    // Deny by omission: with an empty allow-origin the browser blocks the
    // response, which is exactly the intended outcome.
    return { 'Access-Control-Allow-Origin': '', Vary: 'Origin' };
  };
}
