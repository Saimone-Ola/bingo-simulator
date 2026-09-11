import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomBingoConfig } from '@bingo/shared';
import { hasTestDatabase } from './setup';
import { closeDatabase, db } from '../src/db/client';
import { bingoAwards, bingoIssuedCards, bingoPurchases, bingoRounds, ledgerEntries, users } from '../src/db/schema';
import * as ledger from '../src/services/ledger';
import { cancelBingoRound, ensureBingoRound, finishBingoRound, loadBingoPurchase, purchaseBingoCards, queueBingoAwards, recoverInterruptedBingoRounds, settleBingoAward } from '../src/services/bingoEconomy';
import { createUniqueItalianCards } from '../src/realtime/bingoRules';

const suite = hasTestDatabase ? describe : describe.skip;
const config: RoomBingoConfig = {
  training: false,
  minPlayers: 2, maxPlayers: 512, startMode: 'HOST', countdownSeconds: 10,
  cardPrice: 10, maxManualCards: 3, maxAutomaticCards: 6, numberCallInterval: 5000,
  enabledEvents: [], crowdDensity: 0, tier: 'STANDARD', chaosLevel: 'CLASSIC',
};

async function player(credits = 1000) {
  const userId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: userId, email: `bingo-${userId}@test.local`, displayName: `B ${userId.slice(0, 8)}`, passwordHash: 'unused-test-hash' });
    await ledger.ensureWallet(tx, userId);
    if (credits) await ledger.postLedgerEntry(tx, { userId, amount: credits, reason: 'welcome_bonus' });
  });
  return userId;
}

async function round(cardPrice = 10) {
  const gameId = randomUUID();
  await ensureBingoRound({ gameId, roomCode: 'TEST-REUSED-CODE', configSnapshot: { ...config, cardPrice }, seedHash: randomUUID() });
  return gameId;
}

function purchase(gameId: string, userId: string, quantity = 3, cardPrice = 10) {
  const requestId = randomUUID();
  return { gameId, userId, requestId, cardPrice, maxCards: 6, markingMode: 'AUTOMATIC' as const, cards: createUniqueItalianCards(quantity, `${gameId}:${userId}`, userId) };
}

async function consistent(userId: string, expectedBalance: number) {
  expect((await ledger.getWalletState(db, userId)).balance).toBe(expectedBalance);
  expect((await ledger.verifyLedgerIntegrity(db, userId))[0]?.consistent).toBe(true);
}

suite('durable Bingo economy (throwaway PostgreSQL)', () => {
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => closeDatabase());

  it('commits a single purchase under concurrent retries and reloads the exact cards', async () => {
    const userId = await player();
    const gameId = await round();
    const input = purchase(gameId, userId);
    const results = await Promise.all(Array.from({ length: 10 }, () => purchaseBingoCards(input)));
    expect(new Set(results.map((result) => result.purchaseId)).size).toBe(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(results.every((result) => result.cardsSold === 3 && result.potCredits === 30)).toBe(true);
    expect((await loadBingoPurchase(gameId, userId))?.cards).toEqual(input.cards);
    const replay = await purchaseBingoCards({ ...input, cards: createUniqueItalianCards(3, 'regenerated-after-disconnect', userId) });
    expect(replay.cards).toEqual(input.cards);
    await consistent(userId, 970);
  });

  it('does not collide when the hall code and request id are reused in a new UUID round', async () => {
    const userId = await player();
    const first = purchase(await round(), userId, 1);
    const second = { ...purchase(await round(), userId, 1), requestId: first.requestId };
    await purchaseBingoCards(first);
    await purchaseBingoCards(second);
    await consistent(userId, 980);
    const entries = await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.reason, 'bingo_card_purchase')));
    expect(new Set(entries.map((entry) => entry.refId)).size).toBe(2);
  });

  it('rejects a changed request without extra debit or cards', async () => {
    const userId = await player();
    const input = purchase(await round(), userId);
    await purchaseBingoCards(input);
    await expect(purchaseBingoCards({ ...input, requestId: randomUUID() })).rejects.toMatchObject({ code: 'validation_error' });
    await expect(purchaseBingoCards({ ...input, markingMode: 'MANUAL' })).rejects.toMatchObject({ code: 'validation_error' });
    await consistent(userId, 970);
  });

  it('rolls back the debit and purchase when card persistence fails after the ledger write', async () => {
    const userId = await player();
    const gameId = await round();
    const input = purchase(gameId, userId, 2);
    // Valid cards with identical grids violate the database's round uniqueness.
    input.cards[1] = { ...input.cards[0]!, id: `${userId}-duplicate`, index: 1 };
    await expect(purchaseBingoCards(input)).rejects.toThrow();
    await consistent(userId, 1000);
    expect(await db.select().from(bingoPurchases).where(eq(bingoPurchases.gameId, gameId))).toHaveLength(0);
    expect(await db.select().from(bingoIssuedCards).where(eq(bingoIssuedCards.gameId, gameId))).toHaveLength(0);
    const [persistedRound] = await db.select().from(bingoRounds).where(eq(bingoRounds.id, gameId));
    expect(persistedRound).toMatchObject({ cardsSold: 0, potCredits: 0 });
    await purchaseBingoCards(purchase(gameId, userId, 2));
    await consistent(userId, 980);
  });

  it('does not issue cards or overdraw on simultaneous purchases across rounds', async () => {
    const userId = await player(30);
    const games = await Promise.all(Array.from({ length: 6 }, () => round()));
    const results = await Promise.allSettled(games.map((gameId) => purchaseBingoCards(purchase(gameId, userId, 3))));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.select().from(bingoPurchases).where(eq(bingoPurchases.userId, userId))).toHaveLength(1);
    await consistent(userId, 0);
  });

  it('supports free cards without inventing a zero-value ledger entry', async () => {
    const userId = await player(0);
    const input = purchase(await round(0), userId, 3, 0);
    await purchaseBingoCards(input);
    await cancelBingoRound(input.gameId);
    await consistent(userId, 0);
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.userId, userId))).toHaveLength(0);
  });

  it('freezes tied winners atomically, refuses replacements and pays each exactly once', async () => {
    const gameId = await round();
    const userIds = await Promise.all([player(), player()]);
    const buys = userIds.map((userId) => purchase(gameId, userId, 1));
    await Promise.all(buys.map(purchaseBingoCards));
    const input = { gameId, tier: 'CINQUINA' as const, drawIndex: 35, awards: buys.map((buy) => ({ userId: buy.userId, cardId: buy.cards[0]!.id, amount: 3 })) };
    const groups = await Promise.all([queueBingoAwards(input), queueBingoAwards(input)]);
    expect(groups[1]!.map((award) => award.id).sort()).toEqual(groups[0]!.map((award) => award.id).sort());
    await expect(queueBingoAwards({ ...input, awards: input.awards.slice(0, 1) })).rejects.toMatchObject({ code: 'validation_error' });
    await expect(finishBingoRound(gameId)).rejects.toMatchObject({ code: 'validation_error' });
    const results = await Promise.all(groups[0]!.flatMap((award) => Array.from({ length: 5 }, () => settleBingoAward(award.id))));
    expect(results.filter((result) => !result.replayed)).toHaveLength(2);
    await finishBingoRound(gameId);
    expect(await cancelBingoRound(gameId)).toBe(false);
    await Promise.all(userIds.map((userId) => consistent(userId, 993)));
  });

  it('retains a pending win after credit failure, then retries without double-paying', async () => {
    const userId = await player();
    const input = purchase(await round(), userId, 1);
    await purchaseBingoCards(input);
    const [award] = await queueBingoAwards({ gameId: input.gameId, tier: 'BINGO', drawIndex: 70, awards: [{ userId, cardId: input.cards[0]!.id, amount: 7 }] });
    const realPost = ledger.postLedgerEntry;
    vi.spyOn(ledger, 'postLedgerEntry').mockImplementationOnce(async (tx, entry) => {
      await realPost(tx, entry);
      throw new Error('injected failure after credit, before paid marker');
    });
    await expect(settleBingoAward(award!.id)).rejects.toThrow('injected failure');
    await consistent(userId, 990);
    const [pending] = await db.select().from(bingoAwards).where(eq(bingoAwards.id, award!.id));
    expect(pending).toMatchObject({ paidAt: null, ledgerEntryId: null });
    await Promise.all([settleBingoAward(award!.id), settleBingoAward(award!.id)]);
    await consistent(userId, 997);
  });

  it('recovery honours pending wins and refunds interrupted purchases once, preserving cards', async () => {
    const userId = await player();
    const input = purchase(await round(), userId, 1);
    await purchaseBingoCards(input);
    await queueBingoAwards({ gameId: input.gameId, tier: 'CINQUINA', drawIndex: 35, awards: [{ userId, cardId: input.cards[0]!.id, amount: 4 }] });
    await Promise.all([cancelBingoRound(input.gameId), cancelBingoRound(input.gameId)]);
    await consistent(userId, 1004);
    expect(await loadBingoPurchase(input.gameId, userId)).toBeNull();
    expect(await db.select().from(bingoIssuedCards).where(eq(bingoIssuedCards.gameId, input.gameId))).toHaveLength(1);
    const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.userId, userId));
    expect(entries.filter((entry) => entry.reason === 'bingo_prize')).toHaveLength(1);
    expect(entries.filter((entry) => entry.reason === 'bingo_card_refund')).toHaveLength(1);
  });

  it('startup recovery handles every interrupted round and is idempotent', async () => {
    const userId = await player();
    const first = purchase(await round(), userId, 1);
    const second = purchase(await round(), userId, 1);
    await purchaseBingoCards(first);
    await purchaseBingoCards(second);
    expect(await recoverInterruptedBingoRounds()).toBeGreaterThanOrEqual(2);
    expect(await recoverInterruptedBingoRounds()).toBe(0);
    await consistent(userId, 1000);
  });

  it('finishes a durably awarded Bingo after a crash without refunding its completed purchase', async () => {
    const userId = await player();
    const input = purchase(await round(), userId, 1);
    await purchaseBingoCards(input);
    await queueBingoAwards({ gameId: input.gameId, tier: 'BINGO', drawIndex: 70, awards: [{ userId, cardId: input.cards[0]!.id, amount: 7 }] });
    // The process died after committing the terminal winner, before crediting
    // that winner or marking the round finished in its in-memory lifecycle.
    await recoverInterruptedBingoRounds();
    await consistent(userId, 997);
    const [recovered] = await db.select().from(bingoRounds).where(eq(bingoRounds.id, input.gameId));
    expect(recovered?.status).toBe('finished');
    const [persisted] = await db.select().from(bingoPurchases).where(eq(bingoPurchases.gameId, input.gameId));
    expect(persisted?.refundedAt).toBeNull();
    const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.userId, userId));
    expect(entries.filter((entry) => entry.reason === 'bingo_prize')).toHaveLength(1);
    expect(entries.filter((entry) => entry.reason === 'bingo_card_refund')).toHaveLength(0);
    expect(await cancelBingoRound(input.gameId)).toBe(false);
    await recoverInterruptedBingoRounds();
    await consistent(userId, 997);
  });
});
