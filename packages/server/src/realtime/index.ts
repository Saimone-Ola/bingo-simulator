import { Server as ColyseusServer, WebSocketTransport } from 'colyseus';
import { ROOM_NAMES } from '@bingo/shared';
import { env } from '../env';
import { HubRoom } from './hubRoom';

/**
 * The realtime server listens on its own port, separate from the REST API.
 *
 * Sharing Fastify's HTTP listener was the first attempt and does not work:
 * Colyseus binds its matchmaking routes with `prependListener('request')` and,
 * with no Express app to delegate to, its handler answers *every* request -
 * the whole API included. Matchmaking is HTTP (`POST /matchmake/...`) before
 * it is ever a WebSocket, so the transport alone is not enough either; without
 * those routes the client gets a 404 and never reaches the socket.
 *
 * Two ports is also what the platforms this deploys to expect: Render, Fly and
 * Railway all route a dedicated service to a dedicated port.
 */
export function startRealtime(): ColyseusServer {
  const gameServer = new ColyseusServer({
    transport: new WebSocketTransport({
      // Drop a socket that has missed three keepalives: a half-open connection
      // otherwise holds its seat for the full reconnection window.
      pingInterval: 6_000,
      pingMaxRetries: 3,
    }),
  });

  gameServer.define(ROOM_NAMES.hub, HubRoom);

  void gameServer.listen(env.GAME_PORT, env.HOST);

  return gameServer;
}
