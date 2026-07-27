import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { items, ledgerEntries } from './economy';
import { prizeGameKindEnum } from './enums';

/**
 * Prize games scattered around the map: wheel of fortune, 3D scratch cards,
 * pick-a-box, the risk-or-bank ladder, the shooting range.
 *
 * `config` holds the outcome table (weights, prize tiers, rare item drops).
 * It is server-only data: the client is told what it won, never the odds.
 */
export const prizeGames = pgTable(
  'prize_games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 64 }).notNull(),
    kind: prizeGameKindEnum('kind').notNull(),
    name: varchar('name', { length: 60 }).notNull(),
    /** Where the interactable sits in the hub, plus its activation radius. */
    worldPosition: jsonb('world_position').notNull(),
    activationRadius: integer('activation_radius').notNull().default(3),
    config: jsonb('config').notNull(),

    cooldownSeconds: integer('cooldown_seconds').notNull().default(3600),
    /** Cron expression for scheduled jackpot events, null = always available. */
    scheduleCron: varchar('schedule_cron', { length: 64 }),
    jackpotCredits: bigint('jackpot_credits', { mode: 'number' }).notNull().default(0),
    active: boolean('active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('prize_games_code_unique').on(table.code),
    index('prize_games_active_idx').on(table.active),
    check('prize_games_cooldown_non_negative', sql`${table.cooldownSeconds} >= 0`),
  ],
);

/**
 * Every attempt at a prize game, won or lost. Doubles as the cooldown record:
 * eligibility is `now() - max(claimed_at) >= cooldown_seconds`, checked inside
 * the same transaction that inserts the claim.
 */
export const prizeClaims = pgTable(
  'prize_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prizeGameId: uuid('prize_game_id')
      .notNull()
      .references(() => prizeGames.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    serverSeedHash: varchar('server_seed_hash', { length: 64 }).notNull(),
    serverSeed: varchar('server_seed', { length: 128 }),
    /** Full resolved outcome, for replay and for the "what did I win" screen. */
    outcome: jsonb('outcome').notNull(),

    rewardCredits: bigint('reward_credits', { mode: 'number' }).notNull().default(0),
    rewardItemId: uuid('reward_item_id').references(() => items.id, { onDelete: 'set null' }),
    ledgerEntryId: uuid('ledger_entry_id').references(() => ledgerEntries.id),

    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('prize_claims_cooldown_idx').on(table.prizeGameId, table.userId, table.claimedAt),
    index('prize_claims_user_idx').on(table.userId, table.claimedAt),
    check('prize_claims_reward_non_negative', sql`${table.rewardCredits} >= 0`),
  ],
);

export const prizeGamesRelations = relations(prizeGames, ({ many }) => ({
  claims: many(prizeClaims),
}));

export const prizeClaimsRelations = relations(prizeClaims, ({ one }) => ({
  prizeGame: one(prizeGames, { fields: [prizeClaims.prizeGameId], references: [prizeGames.id] }),
  user: one(users, { fields: [prizeClaims.userId], references: [users.id] }),
}));

export type PrizeGame = typeof prizeGames.$inferSelect;
export type PrizeClaim = typeof prizeClaims.$inferSelect;
