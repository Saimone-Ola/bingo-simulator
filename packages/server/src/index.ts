import { env } from './env';
import { buildServer } from './http/server';
import { closeDatabase } from './db/client';

/**
 * Phase 0 boots the HTTP API only. The Colyseus game server joins this process
 * in phase 1, sharing the same database pool and auth verification.
 */
async function main(): Promise<void> {
  const app = await buildServer();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down');
    try {
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

  await app.listen({ host: env.HOST, port: env.PORT });
  app.log.info(`API listening on http://${env.HOST}:${env.PORT}`);
}

main().catch((error: unknown) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
