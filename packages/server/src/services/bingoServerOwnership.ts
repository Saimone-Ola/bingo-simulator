import postgres from 'postgres';
import { env } from '../env';

// A database-scoped, session-level mutex for this single-authority game server.
const LOCK_NAMESPACE = 1_112_101_447;
const LOCK_ID = 1;

export interface BingoServerOwnership {
  /** Useful for checking the dedicated owner connection in PostgreSQL. */
  backendPid: number;
  release(): Promise<void>;
}

/**
 * Keep recovery from cancelling rounds owned by another live process during
 * overlapping deployments. A session lock MUST use a dedicated direct connection;
 * transaction-pooler sessions cannot own it safely.
 *
 * onLost must stop the process immediately: after losing the lock a replacement
 * can already be recovering its rounds, so graceful gameplay writes are unsafe.
 */
export async function acquireBingoServerOwnership(onLost: () => void): Promise<BingoServerOwnership> {
  const connectionString = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  const direct = new URL(connectionString);
  const application = new URL(env.DATABASE_URL);
  if (direct.hostname.includes('-pooler')) {
    throw new Error('Bingo server ownership requires DATABASE_URL_UNPOOLED with the direct database endpoint');
  }
  if (direct.hostname !== application.hostname.replace('-pooler', '') || (direct.port || '5432') !== (application.port || '5432') || direct.pathname !== application.pathname || direct.username !== application.username) {
    throw new Error('DATABASE_URL_UNPOOLED must use the same database and user as DATABASE_URL');
  }
  let acquired = false;
  let closing = false;
  let lost = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const loseOwnership = () => {
    if (!acquired || closing || lost) return;
    lost = true;
    clearInterval(heartbeat);
    onLost();
  };
  const client = postgres(connectionString, {
    max: 1, idle_timeout: 0, max_lifetime: null, connect_timeout: 15, prepare: false,
    connection: { application_name: 'bingo-server-owner' },
    onnotice: () => {}, onclose: loseOwnership,
  });
  try {
    const connection = await client.reserve();
    const [row] = await connection<{ locked: boolean; pid: number }[]>`
      select pg_try_advisory_lock(${LOCK_NAMESPACE}, ${LOCK_ID}) as locked, pg_backend_pid() as pid
    `;
    if (!row?.locked) {
      connection.release();
      throw new Error('Another Bingo server owns this database. Stop that instance before starting this one; recovery was not run.');
    }
    acquired = true;
    let checking = false;
    heartbeat = setInterval(() => {
      if (checking || closing || lost) return;
      checking = true;
      void connection`select 1`.then(() => { checking = false; }).catch(() => {
        checking = false;
        loseOwnership();
      });
    }, 5_000);
    heartbeat.unref();
    return {
      backendPid: row.pid,
      async release() {
        if (closing) return;
        closing = true;
        clearInterval(heartbeat);
        try {
          if (!lost) await connection`select pg_advisory_unlock(${LOCK_NAMESPACE}, ${LOCK_ID})`;
        } finally {
          connection.release();
          await client.end({ timeout: 5 });
        }
      },
    };
  } catch (error) {
    closing = true;
    clearInterval(heartbeat);
    await client.end({ timeout: 5 });
    throw error;
  }
}
