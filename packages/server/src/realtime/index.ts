import type { Server as HttpServer } from 'node:http';
import { Server as ColyseusServer, WebSocketTransport } from 'colyseus';
import { ROOM_NAMES } from '@bingo/shared';
import { HubRoom } from './hubRoom';

/**
 * The realtime server shares the API's HTTP listener rather than binding its
 * own port. One process, one port, one deploy target - and, more usefully, the
 * WebSocket handshake reaches the same origin the client already trusts, so no
 * second CORS or TLS configuration has to be kept in sync.
 */
export function attachRealtime(httpServer: HttpServer): ColyseusServer {
  const gameServer = new ColyseusServer({
    transport: new WebSocketTransport({
      server: httpServer,
      // Drop a socket that has missed three keepalives: a half-open connection
      // otherwise holds its seat for the full reconnection window.
      pingInterval: 6_000,
      pingMaxRetries: 3,
    }),
  });

  gameServer.define(ROOM_NAMES.hub, HubRoom);

  return gameServer;
}
