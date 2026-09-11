import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, index, integer, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import type { BingoClaimTier, BingoMarkingMode, ItalianBingoCard, RoomBingoConfig } from '@bingo/shared';
import { users } from './identity';
import { ledgerEntries } from './economy';

/** Durable accounting for Colyseus halls, which are not user-owned `rooms`. */
export const bingoRounds = pgTable('bingo_rounds', {
  id: uuid('id').primaryKey(),
  roomCode: varchar('room_code', { length: 18 }).notNull(),
  configSnapshot: jsonb('config_snapshot').$type<RoomBingoConfig>().notNull(),
  seedHash: varchar('seed_hash', { length: 64 }).notNull(),
  status: varchar('status', { length: 16 }).$type<'open' | 'finished' | 'cancelled'>().notNull().default('open'),
  cardsSold: integer('cards_sold').notNull().default(0),
  potCredits: bigint('pot_credits', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (table) => [
  index('bingo_rounds_status_idx').on(table.status),
  check('bingo_rounds_status_valid', sql`${table.status} in ('open', 'finished', 'cancelled')`),
  check('bingo_rounds_totals_non_negative', sql`${table.cardsSold} >= 0 and ${table.potCredits} >= 0`),
]);

export const bingoPurchases = pgTable('bingo_purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull(),
  userId: uuid('user_id').notNull(),
  requestId: varchar('request_id', { length: 80 }).notNull(),
  markingMode: varchar('marking_mode', { length: 12 }).$type<BingoMarkingMode>().notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: bigint('unit_price', { mode: 'number' }).notNull(),
  totalCredits: bigint('total_credits', { mode: 'number' }).notNull(),
  ledgerEntryId: uuid('ledger_entry_id'),
  refundLedgerEntryId: uuid('refund_ledger_entry_id'),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ name: 'bingo_purchases_game_id_fkey', columns: [table.gameId], foreignColumns: [bingoRounds.id] }).onDelete('restrict'),
  foreignKey({ name: 'bingo_purchases_user_id_fkey', columns: [table.userId], foreignColumns: [users.id] }).onDelete('restrict'),
  foreignKey({ name: 'bingo_purchases_ledger_entry_id_fkey', columns: [table.ledgerEntryId], foreignColumns: [ledgerEntries.id] }).onDelete('restrict'),
  foreignKey({ name: 'bingo_purchases_refund_ledger_entry_id_fkey', columns: [table.refundLedgerEntryId], foreignColumns: [ledgerEntries.id] }).onDelete('restrict'),
  uniqueIndex('bingo_purchases_request_unique').on(table.gameId, table.userId, table.requestId),
  // The current game allows one cart per player and round, even after reconnect.
  uniqueIndex('bingo_purchases_game_user_unique').on(table.gameId, table.userId),
  check('bingo_purchases_amount_valid', sql`${table.quantity} > 0 and ${table.unitPrice} >= 0 and ${table.totalCredits} = ${table.quantity}::bigint * ${table.unitPrice}`),
  check('bingo_purchases_marking_valid', sql`${table.markingMode} in ('MANUAL', 'AUTOMATIC')`),
  check('bingo_purchases_debit_required', sql`${table.totalCredits} = 0 or ${table.ledgerEntryId} is not null`),
]);

export const bingoIssuedCards = pgTable('bingo_issued_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull(),
  purchaseId: uuid('purchase_id').notNull(),
  userId: uuid('user_id').notNull(),
  cardId: varchar('card_id', { length: 160 }).notNull(),
  cardIndex: integer('card_index').notNull(),
  signature: varchar('signature', { length: 64 }).notNull(),
  card: jsonb('card').$type<ItalianBingoCard>().notNull(),
}, (table) => [
  foreignKey({ name: 'bingo_issued_cards_game_id_fkey', columns: [table.gameId], foreignColumns: [bingoRounds.id] }).onDelete('restrict'),
  foreignKey({ name: 'bingo_issued_cards_purchase_id_fkey', columns: [table.purchaseId], foreignColumns: [bingoPurchases.id] }).onDelete('restrict'),
  foreignKey({ name: 'bingo_issued_cards_user_id_fkey', columns: [table.userId], foreignColumns: [users.id] }).onDelete('restrict'),
  uniqueIndex('bingo_issued_cards_game_id_unique').on(table.gameId, table.cardId),
  uniqueIndex('bingo_issued_cards_game_signature_unique').on(table.gameId, table.signature),
  uniqueIndex('bingo_issued_cards_purchase_index_unique').on(table.purchaseId, table.cardIndex),
]);

export const bingoAwards = pgTable('bingo_awards', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull(),
  tier: varchar('tier', { length: 12 }).$type<BingoClaimTier>().notNull(),
  drawIndex: integer('draw_index').notNull(),
  userId: uuid('user_id').notNull(),
  cardId: varchar('card_id', { length: 160 }).notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  ledgerEntryId: uuid('ledger_entry_id'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ name: 'bingo_awards_game_id_fkey', columns: [table.gameId], foreignColumns: [bingoRounds.id] }).onDelete('restrict'),
  foreignKey({ name: 'bingo_awards_user_id_fkey', columns: [table.userId], foreignColumns: [users.id] }).onDelete('restrict'),
  foreignKey({ name: 'bingo_awards_ledger_entry_id_fkey', columns: [table.ledgerEntryId], foreignColumns: [ledgerEntries.id] }).onDelete('restrict'),
  uniqueIndex('bingo_awards_game_tier_card_unique').on(table.gameId, table.tier, table.cardId),
  index('bingo_awards_pending_idx').on(table.paidAt),
  check('bingo_awards_amount_non_negative', sql`${table.amount} >= 0`),
  check('bingo_awards_draw_valid', sql`${table.drawIndex} between 1 and 90`),
  check('bingo_awards_tier_valid', sql`${table.tier} in ('CINQUINA', 'BINGO')`),
  check('bingo_awards_paid_entry_required', sql`${table.paidAt} is null or ${table.amount} = 0 or ${table.ledgerEntryId} is not null`),
]);

export type BingoAward = typeof bingoAwards.$inferSelect;
