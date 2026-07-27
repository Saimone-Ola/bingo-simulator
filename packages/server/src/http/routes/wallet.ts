import type { FastifyPluginAsync } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { ledgerEntries } from '../../db/schema';
import { AppError } from '../../errors';
import { getWalletState } from '../../services/ledger';

/**
 * Read-only wallet endpoints. There is deliberately no route that writes a
 * balance: credits only ever move as a side effect of a game action resolved
 * by the server.
 */
const walletRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/balance', async (request, reply) => {
    if (!request.auth) throw AppError.unauthorized();
    const state = await getWalletState(db, request.auth.userId);
    return reply.send({ balance: state.balance, entryCount: state.entryCount });
  });

  app.get('/statement', async (request, reply) => {
    if (!request.auth) throw AppError.unauthorized();
    const { limit } = request.query as { limit?: string };
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);

    const entries = await db
      .select({
        id: ledgerEntries.id,
        amount: ledgerEntries.amount,
        balanceAfter: ledgerEntries.balanceAfter,
        reason: ledgerEntries.reason,
        refType: ledgerEntries.refType,
        refId: ledgerEntries.refId,
        createdAt: ledgerEntries.createdAt,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, request.auth.userId))
      .orderBy(desc(ledgerEntries.sequence))
      .limit(take);

    return reply.send({ entries });
  });
};

export default walletRoutes;
