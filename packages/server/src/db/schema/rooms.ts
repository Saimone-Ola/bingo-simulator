import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { ledgerEntries } from './economy';
import {
  bingoCallerEnum,
  bingoGameStatusEnum,
  bingoMarkingEnum,
  bingoModeEnum,
  moderationStateEnum,
  roomKindEnum,
  roomStatusEnum,
  roomVisibilityEnum,
} from './enums';

/**
 * A room is a user-created space in the world: a bingo hall, a slot arcade or
 * a decorated hub zone. `joinCodeHash` keeps private-room codes out of the
 * database in cleartext; the client sends the code and the server compares.
 */
export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 48 }).notNull(),
    slug: varchar('slug', { length: 64 }).notNull(),
    description: varchar('description', { length: 280 }),
    kind: roomKindEnum('kind').notNull(),
    theme: varchar('theme', { length: 40 }).notNull().default('classic'),
    capacity: smallint('capacity').notNull().default(20),
    visibility: roomVisibilityEnum('visibility').notNull().default('public'),
    joinCodeHash: text('join_code_hash'),
    status: roomStatusEnum('status').notNull().default('draft'),

    /** Room editor output: furniture placement, lights, signage. */
    layout: jsonb('layout').notNull().default({}),
    /** Denormalised popularity counters for the room browser and leaderboards. */
    visitCount: bigint('visit_count', { mode: 'number' }).notNull().default(0),
    gamesPlayed: bigint('games_played', { mode: 'number' }).notNull().default(0),

    moderationState: moderationStateEnum('moderation_state').notNull().default('ok'),
    moderationNote: text('moderation_note'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('rooms_slug_unique').on(table.slug),
    index('rooms_owner_idx').on(table.ownerId),
    index('rooms_browse_idx').on(table.kind, table.status, table.visibility),
    check('rooms_capacity_range', sql`${table.capacity} between 2 and 60`),
    check(
      'rooms_private_requires_code',
      sql`(${table.visibility} = 'public') or (${table.joinCodeHash} is not null)`,
    ),
  ],
);

/**
 * The rule set a room owner configures. Snapshotted into every game so that
 * editing the room later never rewrites the history of a finished match.
 */
export const bingoConfigs = pgTable(
  'bingo_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),

    ballCount: smallint('ball_count').notNull().default(90),
    /** Card geometry: rows, columns, numbers per card, free centre square. */
    cardFormat: jsonb('card_format').notNull(),
    cardPriceCredits: bigint('card_price_credits', { mode: 'number' }).notNull().default(10),
    maxCardsPerPlayer: smallint('max_cards_per_player').notNull().default(4),

    /** tier -> payout definition (fixed credits or share of the pot). */
    prizes: jsonb('prizes').notNull(),
    progressiveJackpotEnabled: boolean('progressive_jackpot_enabled').notNull().default(false),
    /** Basis points of every card sale routed to the jackpot. */
    jackpotContributionBps: smallint('jackpot_contribution_bps').notNull().default(0),

    drawIntervalMs: integer('draw_interval_ms').notNull().default(4000),
    marking: bingoMarkingEnum('marking').notNull().default('manual'),
    caller: bingoCallerEnum('caller').notNull().default('auto'),
    mode: bingoModeEnum('mode').notNull().default('standard'),
    /** Player-drawn winning shape, used when mode = custom_pattern. */
    customPattern: jsonb('custom_pattern'),
    teamConfig: jsonb('team_config'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('bingo_configs_room_unique').on(table.roomId),
    check('bingo_configs_ball_count_range', sql`${table.ballCount} between 30 and 120`),
    check('bingo_configs_draw_interval_range', sql`${table.drawIntervalMs} between 1000 and 30000`),
    check('bingo_configs_max_cards_range', sql`${table.maxCardsPerPlayer} between 1 and 20`),
    check('bingo_configs_price_non_negative', sql`${table.cardPriceCredits} >= 0`),
    check(
      'bingo_configs_jackpot_bps_range',
      sql`${table.jackpotContributionBps} between 0 and 2000`,
    ),
    check(
      'bingo_configs_pattern_required',
      sql`(${table.mode} <> 'custom_pattern') or (${table.customPattern} is not null)`,
    ),
  ],
);

/**
 * One match. `serverSeed` stays null until the game ends: publishing the seed
 * afterwards lets anyone replay the draw and verify it against `serverSeedHash`
 * that was announced before the first ball.
 */
export const bingoGames = pgTable(
  'bingo_games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'restrict' }),
    /** Immutable copy of bingo_configs at the moment the game opened. */
    configSnapshot: jsonb('config_snapshot').notNull(),
    status: bingoGameStatusEnum('status').notNull().default('scheduled'),

    serverSeedHash: varchar('server_seed_hash', { length: 64 }).notNull(),
    serverSeed: varchar('server_seed', { length: 128 }),
    /** Draw order, appended one ball at a time by the server. */
    drawnNumbers: integer('drawn_numbers').array().notNull().default(sql`'{}'::integer[]`),

    cardsSold: integer('cards_sold').notNull().default(0),
    potCredits: bigint('pot_credits', { mode: 'number' }).notNull().default(0),
    jackpotCredits: bigint('jackpot_credits', { mode: 'number' }).notNull().default(0),
    /** tier -> { winners: [...], amount } as awarded by the server. */
    results: jsonb('results').notNull().default({}),

    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('bingo_games_room_created_idx').on(table.roomId, table.createdAt),
    index('bingo_games_status_idx').on(table.status),
  ],
);

/**
 * A purchased card. `numbers` is generated server side and is the only source
 * of truth for win verification; the marked mask is a convenience for
 * reconnection and for auto-marking rooms.
 */
export const bingoCards = pgTable(
  'bingo_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => bingoGames.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    cardIndex: smallint('card_index').notNull(),
    /** Row-major grid; null cells are blanks (90-ball) or the free square. */
    numbers: jsonb('numbers').notNull(),
    markedMask: jsonb('marked_mask').notNull().default([]),
    pricePaidCredits: bigint('price_paid_credits', { mode: 'number' }).notNull(),
    ledgerEntryId: uuid('ledger_entry_id').references(() => ledgerEntries.id),
    /** Tiers this card has already been awarded, so nothing pays out twice. */
    awardedTiers: text('awarded_tiers').array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('bingo_cards_game_user_index_unique').on(table.gameId, table.userId, table.cardIndex),
    index('bingo_cards_game_idx').on(table.gameId),
    index('bingo_cards_user_idx').on(table.userId),
  ],
);

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  owner: one(users, { fields: [rooms.ownerId], references: [users.id] }),
  bingoConfig: one(bingoConfigs),
  games: many(bingoGames),
}));

export const bingoGamesRelations = relations(bingoGames, ({ one, many }) => ({
  room: one(rooms, { fields: [bingoGames.roomId], references: [rooms.id] }),
  cards: many(bingoCards),
}));

export const bingoCardsRelations = relations(bingoCards, ({ one }) => ({
  game: one(bingoGames, { fields: [bingoCards.gameId], references: [bingoGames.id] }),
  user: one(users, { fields: [bingoCards.userId], references: [users.id] }),
}));

export type Room = typeof rooms.$inferSelect;
export type BingoConfig = typeof bingoConfigs.$inferSelect;
export type BingoGame = typeof bingoGames.$inferSelect;
export type BingoCard = typeof bingoCards.$inferSelect;
