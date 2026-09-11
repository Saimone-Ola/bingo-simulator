import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { assertCredits, italianColumnRange, type BingoClaimTier, type BingoMarkingMode, type ItalianBingoCard, type RoomBingoConfig } from '@bingo/shared';
import { db, type Executor, type Transaction } from '../db/client';
import { bingoAwards, bingoIssuedCards, bingoPurchases, bingoRounds, type BingoAward } from '../db/schema';
import { AppError } from '../errors';
import { getWalletState, postLedgerEntry } from './ledger';

export type { BingoAward } from '../db/schema';

function conflict(message: string): never {
  throw AppError.conflict('validation_error', message);
}

async function lockRound(tx: Transaction, gameId: string) {
  const [round] = await tx.select().from(bingoRounds).where(eq(bingoRounds.id, gameId)).for('update');
  if (!round) throw AppError.notFound('Bingo round does not exist');
  return round;
}

/** The UUID is created by the room; the human code/counter never identifies money. */
export async function ensureBingoRound(input: {
  gameId: string; roomCode: string; configSnapshot: RoomBingoConfig; seedHash: string;
}): Promise<void> {
  await db.insert(bingoRounds).values({ id: input.gameId, roomCode: input.roomCode, configSnapshot: input.configSnapshot, seedHash: input.seedHash }).onConflictDoNothing({ target: bingoRounds.id });
  const [round] = await db.select().from(bingoRounds).where(eq(bingoRounds.id, input.gameId));
  if (!round || round.roomCode !== input.roomCode || round.seedHash !== input.seedHash) {
    conflict('Bingo round UUID was reused');
  }
}

export interface PurchaseBingoCardsInput {
  gameId: string;
  userId: string;
  requestId: string;
  cards: ItalianBingoCard[];
  cardPrice: number;
  maxCards: number;
  markingMode: BingoMarkingMode;
}

function validateCards(cards: ItalianBingoCard[]): void {
  const ids = new Set<string>();
  for (const [index, card] of cards.entries()) {
    if (!card.id || card.id.length > 160 || ids.has(card.id) || card.index !== index || card.cells.length !== 27 || card.markedIndices.length !== 0) {
      throw AppError.validation('Invalid generated Bingo card');
    }
    ids.add(card.id);
    const seen = new Set<number>();
    for (let row = 0; row < 3; row += 1) {
      let count = 0;
      for (let column = 0; column < 9; column += 1) {
        const value = card.cells[row * 9 + column];
        if (value === null) continue;
        const range = italianColumnRange(column);
        if (value === undefined || !Number.isInteger(value) || value < range.min || value > range.max || seen.has(value)) {
          throw AppError.validation('Invalid generated Bingo numbers');
        }
        seen.add(value);
        count += 1;
      }
      if (count !== 5) throw AppError.validation('Bingo cards require five numbers per row');
    }
    for (let column = 0; column < 9; column += 1) {
      const values = [0, 1, 2].map((row) => card.cells[row * 9 + column]).filter((n): n is number => typeof n === 'number');
      if (!values.length || values.some((n, i) => i > 0 && n <= values[i - 1]!)) throw AppError.validation('Invalid Bingo column');
    }
  }
}

async function cardsForPurchase(exec: Executor, purchaseId: string): Promise<ItalianBingoCard[]> {
  const rows = await exec.select().from(bingoIssuedCards).where(eq(bingoIssuedCards.purchaseId, purchaseId)).orderBy(bingoIssuedCards.cardIndex);
  return rows.map((row) => row.card);
}

/** Cards, their debit and the room's pot commit together, or all roll back. */
export async function purchaseBingoCards(input: PurchaseBingoCardsInput) {
  const unitPrice = assertCredits(input.cardPrice);
  if (!input.requestId || input.requestId.length > 80 || !Number.isInteger(input.maxCards) || input.cards.length < 1 || input.cards.length > input.maxCards) {
    throw AppError.validation('Invalid Bingo purchase');
  }
  const total = assertCredits(unitPrice * input.cards.length);
  return db.transaction(async (tx) => {
    const round = await lockRound(tx, input.gameId);
    const [existing] = await tx.select().from(bingoPurchases).where(and(eq(bingoPurchases.gameId, input.gameId), eq(bingoPurchases.userId, input.userId)));
    if (existing) {
      if (existing.requestId !== input.requestId || existing.quantity !== input.cards.length || existing.unitPrice !== unitPrice || existing.markingMode !== input.markingMode) {
        conflict('Bingo purchase already exists with different parameters');
      }
      return { purchaseId: existing.id, cards: await cardsForPurchase(tx, existing.id), balance: (await getWalletState(tx, input.userId)).balance, cardsSold: round.cardsSold, potCredits: round.potCredits, replayed: true };
    }
    if (round.status !== 'open') conflict('Bingo round is closed');
    const limit = input.markingMode === 'MANUAL' ? round.configSnapshot.maxManualCards : round.configSnapshot.maxAutomaticCards;
    if (unitPrice !== round.configSnapshot.cardPrice || input.cards.length > limit) conflict('Bingo purchase does not match the round configuration');
    validateCards(input.cards);
    const entry = total > 0 ? await postLedgerEntry(tx, {
      userId: input.userId, amount: -total, reason: 'bingo_card_purchase', refType: 'bingo_game', refId: input.gameId,
      idempotencyKey: `bingo:purchase:${input.gameId}:${input.userId}`,
      metadata: { requestId: input.requestId, quantity: input.cards.length, markingMode: input.markingMode, roomCode: round.roomCode },
    }) : null;
    const [purchase] = await tx.insert(bingoPurchases).values({ gameId: input.gameId, userId: input.userId, requestId: input.requestId, markingMode: input.markingMode, quantity: input.cards.length, unitPrice, totalCredits: total, ledgerEntryId: entry?.id }).returning();
    if (!purchase) throw AppError.internal('Bingo purchase was not persisted');
    await tx.insert(bingoIssuedCards).values(input.cards.map((card) => ({
      gameId: input.gameId, purchaseId: purchase.id, userId: input.userId, cardId: card.id, cardIndex: card.index,
      signature: createHash('sha256').update(JSON.stringify(card.cells)).digest('hex'), card,
    })));
    const cardsSold = round.cardsSold + input.cards.length;
    const potCredits = assertCredits(round.potCredits + total);
    await tx.update(bingoRounds).set({ cardsSold, potCredits }).where(eq(bingoRounds.id, input.gameId));
    return { purchaseId: purchase.id, cards: input.cards, balance: entry?.balanceAfter ?? (await getWalletState(tx, input.userId)).balance, cardsSold, potCredits, replayed: false };
  });
}

/** Reload the exact purchased cards on a fresh WebSocket session. */
export async function loadBingoPurchase(gameId: string, userId: string) {
  const [purchase] = await db.select().from(bingoPurchases).where(and(eq(bingoPurchases.gameId, gameId), eq(bingoPurchases.userId, userId)));
  if (!purchase || purchase.refundedAt) return null;
  const [round] = await db.select().from(bingoRounds).where(eq(bingoRounds.id, gameId));
  if (!round || round.status === 'cancelled') return null;
  return { ...purchase, cards: await cardsForPurchase(db, purchase.id), balance: (await getWalletState(db, userId)).balance,
    cardsSold: round.cardsSold, potCredits: round.potCredits };
}

export interface QueueBingoAwardsInput {
  gameId: string;
  tier: BingoClaimTier;
  drawIndex: number;
  awards: { userId: string; cardId: string; amount: number; metadata?: Record<string, unknown> }[];
}

/** Freeze every tied winner before attempting any wallet credit. */
export async function queueBingoAwards(input: QueueBingoAwardsInput): Promise<BingoAward[]> {
  if (!input.awards.length || !Number.isInteger(input.drawIndex) || input.drawIndex < 1 || input.drawIndex > 90) throw AppError.validation('Invalid Bingo award group');
  input.awards.forEach((award) => assertCredits(award.amount));
  return db.transaction(async (tx) => {
    const round = await lockRound(tx, input.gameId);
    const existing = await tx.select().from(bingoAwards).where(and(eq(bingoAwards.gameId, input.gameId), eq(bingoAwards.tier, input.tier)));
    if (existing.length) {
      if (existing.length !== input.awards.length || existing.some((award) => award.drawIndex !== input.drawIndex || !input.awards.some((candidate) => candidate.cardId === award.cardId && candidate.userId === award.userId && candidate.amount === award.amount))) {
        conflict('Bingo award group is already frozen');
      }
      return existing;
    }
    if (round.status !== 'open') conflict('Bingo round is closed');
    const cards = await tx.select().from(bingoIssuedCards).where(eq(bingoIssuedCards.gameId, input.gameId));
    if (input.awards.some((award) => !cards.some((card) => card.cardId === award.cardId && card.userId === award.userId))) {
      conflict('Award must belong to a persisted purchased card');
    }
    return tx.insert(bingoAwards).values(input.awards.map((award) => ({ ...award, gameId: input.gameId, tier: input.tier, drawIndex: input.drawIndex }))).returning();
  });
}

async function settleAward(tx: Transaction, award: BingoAward) {
  if (award.paidAt) return { balance: (await getWalletState(tx, award.userId)).balance, paid: true as const, replayed: true };
  const entry = award.amount > 0 ? await postLedgerEntry(tx, {
    userId: award.userId, amount: award.amount, reason: 'bingo_prize', refType: 'bingo_game', refId: award.gameId,
    idempotencyKey: `bingo:award:${award.id}`,
    metadata: { ...award.metadata, tier: award.tier, cardId: award.cardId, drawIndex: award.drawIndex },
  }) : null;
  await tx.update(bingoAwards).set({ ledgerEntryId: entry?.id, paidAt: new Date() }).where(eq(bingoAwards.id, award.id));
  return { balance: entry?.balanceAfter ?? (await getWalletState(tx, award.userId)).balance, paid: true as const, replayed: entry?.replayed ?? false };
}

/** The pending row survives a rollback; credit and paid flag are one transaction. */
export async function settleBingoAward(awardId: string) {
  return db.transaction(async (tx) => {
    const [lookup] = await tx.select({ gameId: bingoAwards.gameId }).from(bingoAwards).where(eq(bingoAwards.id, awardId));
    if (!lookup) throw AppError.notFound('Bingo award does not exist');
    await lockRound(tx, lookup.gameId);
    const [award] = await tx.select().from(bingoAwards).where(eq(bingoAwards.id, awardId)).for('update');
    if (!award) throw AppError.notFound('Bingo award does not exist');
    return settleAward(tx, award);
  });
}

export async function retryPendingBingoAwards(): Promise<{ paid: number; failed: number }> {
  const awards = await db.select({ id: bingoAwards.id }).from(bingoAwards).where(isNull(bingoAwards.paidAt));
  let paid = 0;
  let failed = 0;
  for (const award of awards) {
    try { await settleBingoAward(award.id); paid += 1; } catch { failed += 1; }
  }
  return { paid, failed };
}

/** Called only after all results have been settled; no pending win is discarded. */
export async function finishBingoRound(gameId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const round = await lockRound(tx, gameId);
    if (round.status === 'finished') return;
    if (round.status !== 'open') conflict('Cancelled Bingo round cannot finish');
    const pending = await tx.select({ id: bingoAwards.id }).from(bingoAwards).where(and(eq(bingoAwards.gameId, gameId), isNull(bingoAwards.paidAt))).limit(1);
    if (pending.length) conflict('Bingo payouts are still pending');
    await tx.update(bingoRounds).set({ status: 'finished', closedAt: new Date() }).where(eq(bingoRounds.id, gameId));
  });
}

/**
 * A process restart cannot reconstruct timers, claims and events faithfully.
 * A frozen BINGO proves the terminal result: settle it and finish without a
 * refund. Otherwise honour frozen wins, refund the interrupted purchase and
 * retain cards for audit. All recovery writes commit together.
 */
export async function cancelBingoRound(gameId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const round = await lockRound(tx, gameId);
    if (round.status !== 'open') return false;
    const awards = await tx.select().from(bingoAwards).where(eq(bingoAwards.gameId, gameId));
    const purchases = await tx.select().from(bingoPurchases).where(eq(bingoPurchases.gameId, gameId));
    const bingoCompleted = awards.some((award) => award.tier === 'BINGO');
    const users = [...new Set([...awards.map((award) => award.userId), ...purchases.map((purchase) => purchase.userId)])].sort();
    for (const userId of users) {
      for (const award of awards.filter((candidate) => candidate.userId === userId)) await settleAward(tx, award);
      if (bingoCompleted) continue;
      for (const purchase of purchases.filter((candidate) => candidate.userId === userId && !candidate.refundedAt)) {
        const refund = purchase.totalCredits > 0 ? await postLedgerEntry(tx, {
          userId, amount: purchase.totalCredits, reason: 'bingo_card_refund', refType: 'bingo_game', refId: gameId,
          idempotencyKey: `bingo:refund:${purchase.id}`, metadata: { cause: 'interrupted_round', purchaseId: purchase.id, roomCode: round.roomCode },
        }) : null;
        await tx.update(bingoPurchases).set({ refundedAt: new Date(), refundLedgerEntryId: refund?.id }).where(eq(bingoPurchases.id, purchase.id));
      }
    }
    await tx.update(bingoRounds).set({ status: bingoCompleted ? 'finished' : 'cancelled', closedAt: new Date() }).where(eq(bingoRounds.id, gameId));
    return true;
  });
}

/** Run before accepting connections on the single authoritative game server. */
export async function recoverInterruptedBingoRounds(): Promise<number> {
  const rounds = await db.select({ id: bingoRounds.id }).from(bingoRounds).where(eq(bingoRounds.status, 'open'));
  let recovered = 0;
  for (const round of rounds) if (await cancelBingoRound(round.id)) recovered += 1;
  return recovered;
}
