import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { rooms } from './rooms';
import { ledgerEntries } from './economy';
import { slotStatusEnum, slotVolatilityEnum } from './enums';

/**
 * A player-authored slot machine.
 *
 * `rtpTheoretical` is computed by the server from reels + paytable + features
 * (never sent by the client) and a machine can only reach `published` while it
 * sits inside the allowed RTP window. `configHash` pins the exact configuration
 * every spin was resolved against, so a later edit bumps `version` instead of
 * silently rewriting the past.
 */
export const slotMachines = pgTable(
  'slot_machines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 48 }).notNull(),
    description: varchar('description', { length: 280 }),

    reels: smallint('reels').notNull().default(5),
    rows: smallint('rows').notNull().default(3),
    /** Ordered list of line definitions (cell index per reel). */
    paylines: jsonb('paylines').notNull(),
    /** Symbol catalogue: id, kind (normal/wild/scatter), art, reel weights. */
    symbols: jsonb('symbols').notNull(),
    /** symbol -> match length -> payout multiplier of the line bet. */
    paytable: jsonb('paytable').notNull(),
    /** Free spins, multipliers, bonus minigame parameters. */
    features: jsonb('features').notNull().default({}),
    volatility: slotVolatilityEnum('volatility').notNull().default('medium'),

    minBetCredits: bigint('min_bet_credits', { mode: 'number' }).notNull().default(1),
    maxBetCredits: bigint('max_bet_credits', { mode: 'number' }).notNull().default(100),

    rtpTheoretical: numeric('rtp_theoretical', { precision: 6, scale: 4 }),
    /** Measured RTP from the last simulation run, and its sample size. */
    rtpSimulated: numeric('rtp_simulated', { precision: 6, scale: 4 }),
    rtpSimulationSpins: bigint('rtp_simulation_spins', { mode: 'number' }),
    rtpComputedAt: timestamp('rtp_computed_at', { withTimezone: true }),

    status: slotStatusEnum('status').notNull().default('draft'),
    rejectionReason: varchar('rejection_reason', { length: 280 }),
    version: integer('version').notNull().default(1),
    configHash: varchar('config_hash', { length: 64 }),

    totalSpins: bigint('total_spins', { mode: 'number' }).notNull().default(0),
    totalWagered: bigint('total_wagered', { mode: 'number' }).notNull().default(0),
    totalPaidOut: bigint('total_paid_out', { mode: 'number' }).notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('slot_machines_owner_idx').on(table.ownerId),
    index('slot_machines_status_idx').on(table.status),
    check('slot_machines_reels_range', sql`${table.reels} in (3, 5)`),
    check('slot_machines_rows_range', sql`${table.rows} between 1 and 5`),
    check('slot_machines_bet_range', sql`${table.minBetCredits} between 1 and ${table.maxBetCredits}`),
    // Enforced in code too, but the database refuses to hold a published
    // machine outside the legal RTP window no matter what calls it.
    check(
      'slot_machines_published_rtp_window',
      sql`(${table.status} <> 'published') or (${table.rtpTheoretical} between 0.85 and 0.98)`,
    ),
  ],
);

/**
 * One spin. Provably fair: the hash is committed up front, the seed is stored
 * and the nonce increments per machine so the whole sequence is replayable.
 */
export const slotSpins = pgTable(
  'slot_spins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => slotMachines.id, { onDelete: 'restrict' }),
    machineVersion: integer('machine_version').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    betCredits: bigint('bet_credits', { mode: 'number' }).notNull(),
    winCredits: bigint('win_credits', { mode: 'number' }).notNull().default(0),

    serverSeedHash: varchar('server_seed_hash', { length: 64 }).notNull(),
    serverSeed: varchar('server_seed', { length: 128 }),
    nonce: bigint('nonce', { mode: 'number' }).notNull(),

    /** Resulting symbol grid, winning lines and any triggered feature. */
    resultGrid: jsonb('result_grid').notNull(),
    lineWins: jsonb('line_wins').notNull().default([]),
    featureResults: jsonb('feature_results').notNull().default({}),

    betLedgerEntryId: uuid('bet_ledger_entry_id').references(() => ledgerEntries.id),
    winLedgerEntryId: uuid('win_ledger_entry_id').references(() => ledgerEntries.id),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('slot_spins_machine_nonce_unique').on(table.machineId, table.nonce),
    index('slot_spins_user_created_idx').on(table.userId, table.createdAt),
    index('slot_spins_big_wins_idx').on(table.winCredits),
    check('slot_spins_bet_positive', sql`${table.betCredits} > 0`),
    check('slot_spins_win_non_negative', sql`${table.winCredits} >= 0`),
  ],
);

export const slotMachinesRelations = relations(slotMachines, ({ one, many }) => ({
  owner: one(users, { fields: [slotMachines.ownerId], references: [users.id] }),
  room: one(rooms, { fields: [slotMachines.roomId], references: [rooms.id] }),
  spins: many(slotSpins),
}));

export const slotSpinsRelations = relations(slotSpins, ({ one }) => ({
  machine: one(slotMachines, { fields: [slotSpins.machineId], references: [slotMachines.id] }),
  user: one(users, { fields: [slotSpins.userId], references: [users.id] }),
}));

export type SlotMachine = typeof slotMachines.$inferSelect;
export type SlotSpin = typeof slotSpins.$inferSelect;
