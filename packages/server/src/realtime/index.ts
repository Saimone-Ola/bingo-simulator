import { Server as ColyseusServer, WebSocketTransport } from 'colyseus';
import { ROOM_NAMES } from '@bingo/shared';
import { env } from '../env';
import { mountApi } from '../http/app';
import { configureRealtimeCors } from './cors';
import { HubRoom } from './hubRoom';

/**
 * The whole server: REST API, matchmaking and WebSocket rooms, on one port.
 *
 * Colyseus binds its matchmaking routes with `prependListener('request')` and,
 * without an Express app to fall through to, answers every request on that
 * server. Giving it one via the `express` option inverts that: matchmaking
 * paths go to Colyseus, everything else reaches the API.
 *
 * One port matters because a PaaS (Render, Fly, Railway) exposes exactly one
 * port per service. Two listeners would mean two services, two URLs, two cold
 * starts and a second CORS configuration to keep in sync.
 */
export function createGameServer(): ColyseusServer {
  // Must run before the router is bound: Colyseus answers preflights itself.
  configureRealtimeCors();

  const gameServer = new ColyseusServer({
    transport: new WebSocketTransport({
      // Drop a socket that has missed three keepalives: a half-open connection
      // otherwise holds its seat for the full reconnection window.
      pingInterval: 6_000,
      pingMaxRetries: 3,
    }),
    express: (app) => {
      mountApi(app);
    },
  });

  gameServer.define(ROOM_NAMES.hub, HubRoom);

  return gameServer;
}

export async function startGameServer(): Promise<ColyseusServer> {
  const gameServer = createGameServer();
  await gameServer.listen(env.PORT, env.HOST);
  return gameServer;
}
