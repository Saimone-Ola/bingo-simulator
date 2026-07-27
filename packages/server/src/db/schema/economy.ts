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
import {
  acquisitionEnum,
  itemCategoryEnum,
  itemSlotEnum,
  ledgerReasonEnum,
  ledgerRefTypeEnum,
  rarityEnum,
} from './enums';

/**
 * Wallets hold a *materialised* balance: a cache of the ledger, not the truth.
 * `entryCount` and `balance` are only ever moved by the ledger service inside
 * the same transaction that appends the entry, and
 * `scripts/check-ledger-integrity.ts` re-derives both from ledger_entries.
 */
export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    balance: bigint('balance', { mode: 'number' }).notNull().default(0),
    entryCount: bigint('entry_count', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('wallets_user_unique').on(table.userId),
    // A wallet can never go negative. There is no credit line in this game.
    check('wallets_balance_non_negative', sql`${table.balance} >= 0`),
  ],
);

/**
 * The immutable ledger. Append only - a database trigger (see migration
 * 0001_ledger_immutability) rejects UPDATE and DELETE on this table.
 *
 * `balanceAfter` is recorded at write time so any entry can be audited in
 * isolation, and `idempotencyKey` makes a retried game action safe to replay.
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Signed: negative debits the player, positive credits them. Never zero. */
    amount: bigint('amount', { mode: 'number' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
    /** Monotonic per wallet, so gaps or reorders are detectable. */
    sequence: bigint('sequence', { mode: 'number' }).notNull(),
    reason: ledgerReasonEnum('reason').notNull(),
    refType: ledgerRefTypeEnum('ref_type').notNull().default('none'),
    refId: uuid('ref_id'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ledger_entries_idempotency_unique').on(table.idempotencyKey),
    uniqueIndex('ledger_entries_wallet_sequence_unique').on(table.walletId, table.sequence),
    index('ledger_entries_user_created_idx').on(table.userId, table.createdAt),
    index('ledger_entries_ref_idx').on(table.refType, table.refId),
    check('ledger_entries_amount_non_zero', sql`${table.amount} <> 0`),
    check('ledger_entries_balance_non_negative', sql`${table.balanceAfter} >= 0`),
  ],
);

/** Catalogue of everything ownable: clothing, emotes, room furniture, themes. */
export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    description: text('description'),
    category: itemCategoryEnum('category').notNull(),
    slot: itemSlotEnum('slot'),
    rarity: rarityEnum('rarity').notNull().default('common'),

    /** null = not directly purchasable (prize or reward only). */
    priceCredits: bigint('price_credits', { mode: 'number' }),
    purchasable: boolean('purchasable').notNull().default(false),
    /** ISO week the item is featured in the rotating shop, null = always on. */
    rotationWeek: integer('rotation_week'),

    meshUrl: text('mesh_url'),
    thumbnailUrl: text('thumbnail_url'),
    /** Texture atlas the item's material belongs to, for draw-call batching. */
    atlasId: varchar('atlas_id', { length: 40 }),
    triangleCount: integer('triangle_count').notNull().default(0),
    tintable: boolean('tintable').notNull().default(false),
    metadata: jsonb('metadata').notNull().default({}),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('items_code_unique').on(table.code),
    index('items_category_rarity_idx').on(table.category, table.rarity),
    check(
      'items_price_requires_purchasable',
      sql`(${table.purchasable} = false) or (${table.priceCredits} is not null and ${table.priceCredits} >= 0)`,
    ),
  ],
);

export const userInventory = pgTable(
  'user_inventory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    acquiredVia: acquisitionEnum('acquired_via').notNull(),
    /** The purchase that produced this row, when there was one. */
    ledgerEntryId: uuid('ledger_entry_id').references(() => ledgerEntries.id),
    quantity: smallint('quantity').notNull().default(1),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('user_inventory_user_item_unique').on(table.userId, table.itemId),
    index('user_inventory_user_idx').on(table.userId),
    check('user_inventory_quantity_positive', sql`${table.quantity} > 0`),
  ],
);

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(users, { fields: [wallets.userId], references: [users.id] }),
  entries: many(ledgerEntries),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  wallet: one(wallets, { fields: [ledgerEntries.walletId], references: [wallets.id] }),
  user: one(users, { fields: [ledgerEntries.userId], references: [users.id] }),
}));

export type Wallet = typeof wallets.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type Item = typeof items.$inferSelect;
export type InventoryRow = typeof userInventory.$inferSelect;
