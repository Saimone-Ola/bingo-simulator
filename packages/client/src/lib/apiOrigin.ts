/**
 * The single source of truth for where the server lives.
 *
 * API, matchmaking and the WebSocket upgrade all share one port, so one origin
 * answers for all three and the socket endpoint is this value with the scheme
 * swapped.
 *
 * VITE_API_URL remains the preferred override. Development uses the local
 * server, while production falls back to the deployed Render API so a missing
 * Vercel build variable cannot send API requests to the static frontend.
 */
export function apiOrigin(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, '');

  if (import.meta.env.DEV) return 'http://localhost:3001';
  return 'https://bingo-server-7f6w.onrender.com';
}

/** The same origin as a WebSocket URL. `wss://` under TLS, never optional. */
export function wsOrigin(): string {
  const url = new URL(apiOrigin());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString().replace(/\/$/, '');
}
