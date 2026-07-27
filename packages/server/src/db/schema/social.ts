import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { rooms } from './rooms';
import {
  chatScopeEnum,
  moderationStateEnum,
  reportReasonEnum,
  reportStatusEnum,
  reportTargetEnum,
} from './enums';

/**
 * Chat history. `body` is the text as delivered (already passed through the
 * profanity filter); `originalBody` keeps the raw input for moderators only
 * when the filter changed something, so reports can be judged fairly.
 */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: chatScopeEnum('scope').notNull(),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id').references(() => users.id, { onDelete: 'cascade' }),

    body: varchar('body', { length: 240 }).notNull(),
    originalBody: varchar('original_body', { length: 240 }),
    wasFiltered: boolean('was_filtered').notNull().default(false),
    moderationState: moderationStateEnum('moderation_state').notNull().default('ok'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('chat_messages_room_created_idx').on(table.roomId, table.createdAt),
    index('chat_messages_sender_idx').on(table.senderId, table.createdAt),
    index('chat_messages_dm_idx').on(table.recipientId, table.createdAt),
    check(
      'chat_messages_scope_targets',
      sql`(${table.scope} = 'global' and ${table.roomId} is null and ${table.recipientId} is null)
        or (${table.scope} = 'room' and ${table.roomId} is not null)
        or (${table.scope} = 'private' and ${table.recipientId} is not null)`,
    ),
  ],
);

/** Player reports against users, rooms, messages or published slot machines. */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: reportTargetEnum('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    reason: reportReasonEnum('reason').notNull(),
    details: varchar('details', { length: 1000 }),

    status: reportStatusEnum('status').notNull().default('open'),
    handledById: uuid('handled_by_id').references(() => users.id, { onDelete: 'set null' }),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    resolution: text('resolution'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('reports_status_created_idx').on(table.status, table.createdAt),
    index('reports_target_idx').on(table.targetType, table.targetId),
    index('reports_reporter_idx').on(table.reporterId),
  ],
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  sender: one(users, { fields: [chatMessages.senderId], references: [users.id] }),
  room: one(rooms, { fields: [chatMessages.roomId], references: [rooms.id] }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  reporter: one(users, { fields: [reports.reporterId], references: [users.id] }),
}));

export type ChatMessage = typeof chatMessages.$inferSelect;
export type Report = typeof reports.$inferSelect;
