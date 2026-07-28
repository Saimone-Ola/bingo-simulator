import { env } from './env';
import { buildServer } from './http/server';
import { closeDatabase } from './db/client';
import { attachRealtime } from './realtime';

/**
 * One process serves both the REST API and the Colyseus hub, sharing the same
 * HTTP listener, database pool and token verification.
 */
async function main(): Promise<void> {
  const app = await buildServer();

  // Fastify must be listening before its raw server can carry the WebSocket
  // upgrade handler, so bind first and attach after.
  await app.listen({ host: env.HOST, port: env.PORT });
  const gameServer = attachRealtime(app.server);

  app.log.info(`API listening on http://${env.HOST}:${env.PORT}`);
  app.log.info(`Hub accepting WebSocket connections on the same port`);

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
