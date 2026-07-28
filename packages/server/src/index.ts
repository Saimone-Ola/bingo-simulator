import { env } from './env';
import { closeDatabase } from './db/client';
import { startGameServer } from './realtime';

/**
 * One process, one port: the REST API, the matchmaking endpoints and the
 * WebSocket rooms all share `PORT`. See realtime/index.ts for why they must.
 */
async function main(): Promise<void> {
  const gameServer = await startGameServer();

  console.log(`Bingo Simulator listening on http://${env.HOST}:${env.PORT}`);
  console.log(`  API        http://${env.HOST}:${env.PORT}/api`);
  console.log(`  Hub        ws://${env.HOST}:${env.PORT}`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Shutting down (${signal})`);
    try {
      // Rooms first: this gives connected players a clean leave instead of a
      // socket that dies mid-tick.
      await gameServer.gracefullyShutdown(false);
      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('Shutdown failed:', error);
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
