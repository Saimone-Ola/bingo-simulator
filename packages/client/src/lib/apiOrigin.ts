/**
 * The single source of truth for where the server lives.
 *
 * API, matchmaking and the WebSocket upgrade all share one port, so one origin
 * answers for all three and the socket endpoint is this value with the scheme
 * swapped.
 *
 * The fallback is deliberately different per environment. In development the
 * server is on another port, so `localhost:3001` is the useful default. In a
 * production build a missing `VITE_API_URL` used to mean the client quietly
 * called `localhost:3001` from the visitor's browser - a request that either
 * fails obscurely or, worse, reaches something else running on their machine.
 * Falling back to the page's own origin instead is correct when the client is
 * served by the game server, and fails visibly against that host otherwise.
 */
export function apiOrigin(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, '');

  if (import.meta.env.DEV) return 'http://localhost:3001';
  return window.location.origin;
}

/** The same origin as a WebSocket URL. `wss://` under TLS, never optional. */
export function wsOrigin(): string {
  const url = new URL(apiOrigin());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString().replace(/\/$/, '');
}
