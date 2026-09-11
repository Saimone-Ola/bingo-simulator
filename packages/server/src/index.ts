import { env } from './env';
import { closeDatabase } from './db/client';
import { startGameServer } from './realtime';
import { recoverInterruptedBingoRounds, retryPendingBingoAwards } from './services/bingoEconomy';
import { acquireBingoServerOwnership } from './services/bingoServerOwnership';
import { sanitizeError } from './logging';

/**
 * One process, one port: the REST API, the matchmaking endpoints and the
 * WebSocket rooms all share `PORT`. See realtime/index.ts for why they must.
 */
async function main(): Promise<void> {
  const ownership = await acquireBingoServerOwnership(() => {
    console.error('Bingo database ownership connection lost; stopping before another server recovers these rounds.');
    process.exit(1);
  });
  let gameServer: Awaited<ReturnType<typeof startGameServer>>;
  try {
    await recoverInterruptedBingoRounds();
    gameServer = await startGameServer();
  } catch (error) {
    await closeDatabase();
    await ownership.release();
    throw error;
  }

  console.log(`Bingo Simulator listening on http://${env.HOST}:${env.PORT}`);
  console.log(`  API        http://${env.HOST}:${env.PORT}/api`);
  console.log(`  Hub        ws://${env.HOST}:${env.PORT}`);

  let shuttingDown = false;
  let payoutRetry: Promise<void> | null = null;
  const payoutTimer = setInterval(() => {
    if (shuttingDown || payoutRetry) return;
    payoutRetry = retryPendingBingoAwards().then(({ failed }) => {
      if (failed > 0) console.warn(`${failed} Bingo prize payments remain pending; retrying automatically.`);
    }).catch((error: unknown) => {
      console.error('Bingo pending payment scan failed:', sanitizeError(error));
    }).finally(() => { payoutRetry = null; });
  }, 5_000);
  payoutTimer.unref();
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(payoutTimer);
    console.log(`Shutting down (${signal})`);
    try {
      // Rooms first: this gives connected players a clean leave instead of a
      // socket that dies mid-tick.
      await gameServer.gracefullyShutdown(false);
      await payoutRetry;
      await closeDatabase();
      await ownership.release();
      process.exit(0);
    } catch (error) {
      console.error('Shutdown failed:', sanitizeError(error));
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error('Failed to start server:', sanitizeError(error));
  process.exit(1);
});
