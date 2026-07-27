import { relations, sql } from 'drizzle-orm';
import {
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
import { friendshipStatusEnum, localeEnum, userRoleEnum, userStatusEnum } from './enums';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 254 }).notNull(),
    /** Argon2id hash. Never leaves the server, never enters a response body. */
    passwordHash: text('password_hash').notNull(),
    displayName: varchar('display_name', { length: 20 }).notNull(),
    role: userRoleEnum('role').notNull().default('player'),
    status: userStatusEnum('status').notNull().default('active'),
    locale: localeEnum('locale').notNull().default('it'),

    level: integer('level').notNull().default(1),
    experience: integer('experience').notNull().default(0),

    /** Advisory age gate acceptance, and the optional self-imposed play limit. */
    ageAcknowledgedAt: timestamp('age_acknowledged_at', { withTimezone: true }),
    sessionLimitMinutes: smallint('session_limit_minutes'),

    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    suspendedUntil: timestamp('suspended_until', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Case-insensitive uniqueness without requiring the citext extension.
    uniqueIndex('users_email_unique').on(sql`lower(${table.email})`),
    uniqueIndex('users_display_name_unique').on(sql`lower(${table.displayName})`),
    index('users_status_idx').on(table.status),
  ],
);

/**
 * One row per signed-in device. Refresh tokens are stored as SHA-256 hashes so
 * a database leak cannot be replayed, and rotation is detectable: a reused
 * token revokes the whole family.
 */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    /** Groups every rotation of the same login, for reuse detection. */
    familyId: uuid('family_id').notNull(),
    userAgent: varchar('user_agent', { length: 400 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    rotatedToId: uuid('rotated_to_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('auth_sessions_token_unique').on(table.refreshTokenHash),
    index('auth_sessions_user_idx').on(table.userId),
    index('auth_sessions_family_idx').on(table.familyId),
  ],
);

export const avatars = pgTable(
  'avatars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bodyType: varchar('body_type', { length: 24 }).notNull().default('neutral'),
    skinTone: varchar('skin_tone', { length: 16 }).notNull().default('#e0b49a'),
    hairStyle: varchar('hair_style', { length: 32 }).notNull().default('short'),
    hairColor: varchar('hair_color', { length: 16 }).notNull().default('#2b2118'),
    faceId: varchar('face_id', { length: 32 }).notNull().default('face_01'),
    heightCm: smallint('height_cm').notNull().default(175),
    /** slot -> item id. Validated against user_inventory on every change. */
    equipped: jsonb('equipped').notNull().default({}),
    /** Per-item colour overrides, if the item allows tinting. */
    colorway: jsonb('colorway').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('avatars_user_unique').on(table.userId),
    check('avatars_height_range', sql`${table.heightCm} between 140 and 210`),
  ],
);

/** Saved outfits ("guardaroba"). One row per saved set. */
export const wardrobeSets = pgTable(
  'wardrobe_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 40 }).notNull(),
    equipped: jsonb('equipped').notNull().default({}),
    colorway: jsonb('colorway').notNull().default({}),
    isFavourite: boolean('is_favourite').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('wardrobe_sets_user_name_unique').on(table.userId, table.name)],
);

export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: uuid('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: friendshipStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('friendships_pair_unique').on(table.requesterId, table.addresseeId),
    index('friendships_addressee_idx').on(table.addresseeId, table.status),
    check('friendships_no_self', sql`${table.requesterId} <> ${table.addresseeId}`),
  ],
);

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(authSessions),
  avatar: one(avatars),
  wardrobeSets: many(wardrobeSets),
}));

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, { fields: [authSessions.userId], references: [users.id] }),
}));

export const avatarsRelations = relations(avatars, ({ one }) => ({
  user: one(users, { fields: [avatars.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuthSession = typeof authSessions.$inferSelect;
export type Avatar = typeof avatars.$inferSelect;
