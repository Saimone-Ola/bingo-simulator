import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { ledgerEntries } from '../../db/schema';
import { AppError } from '../../errors';
import { getWalletState } from '../../services/ledger';
import { asyncRoute, requireAuth } from '../middleware/auth';

/**
 * Read-only wallet endpoints. There is deliberately no route that writes a
 * balance: credits only ever move as a side effect of a game action resolved
 * by the server.
 */
const walletRoutes: Router = Router();

walletRoutes.use(requireAuth);

walletRoutes.get(
  '/balance',
  asyncRoute(async (request, response) => {
    if (!request.auth) throw AppError.unauthorized();
    const state = await getWalletState(db, request.auth.userId);
    response.json({ balance: state.balance, entryCount: state.entryCount });
  }),
);

walletRoutes.get(
  '/statement',
  asyncRoute(async (request, response) => {
    if (!request.auth) throw AppError.unauthorized();
    const take = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200);

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

    response.json({ entries });
  }),
);

export default walletRoutes;
