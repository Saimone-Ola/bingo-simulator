import { env } from './env';
import { buildServer } from './http/server';
import { closeDatabase } from './db/client';
import { startRealtime } from './realtime';

/**
 * One process, two listeners: the REST API on PORT and the Colyseus hub on
 * GAME_PORT. They share the database pool and the token verification, but not
 * the HTTP server - Colyseus's matchmaking router takes over every request on
 * whatever server it is bound to.
 */
async function main(): Promise<void> {
  const app = await buildServer();

  await app.listen({ host: env.HOST, port: env.PORT });
  const gameServer = startRealtime();

  app.log.info(`API listening on http://${env.HOST}:${env.PORT}`);
  app.log.info(`Hub listening on ws://${env.HOST}:${env.GAME_PORT}`);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down');
    try {
      // Rooms first: this gives connected players a clean leave instead of a
      // socket that dies mid-tick.
      await gameServer.gracefullyShutdown(false);
      await app.close();
      await closeDatabase();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'Shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
