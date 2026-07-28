import { and, desc, eq, isNull, or } from 'drizzle-orm';
import {
  CHAT_HISTORY_LIMIT,
  type ChatMessagePayload,
  type ChatScope,
} from '@bingo/shared';
import { db } from '../db/client';
import { chatMessages, users } from '../db/schema';
import { filterText } from '../moderation/textFilter';

/**
 * Chat persistence and the moderation decision that precedes it.
 *
 * The filter runs here rather than in the room so that every future entry
 * point - bingo rooms, slot arcades, private messages from the friends list -
 * gets the same treatment without having to remember to ask for it.
 */

export interface PreparedMessage {
  id: string;
  body: string;
  filtered: boolean;
  blocked: boolean;
  /** The matched terms, for the moderation log. Never sent to a player. */
  matches: string[];
}

/**
 * Applies the filter and mints the message id. Does not write anything: the
 * caller decides whether a blocked message is worth recording.
 */
export function prepareMessage(rawBody: string): PreparedMessage {
  const result = filterText(rawBody);
  return {
    id: crypto.randomUUID(),
    body: result.text,
    filtered: result.verdict === 'masked',
    blocked: result.verdict === 'blocked',
    matches: result.matches,
  };
}

export interface PersistArgs {
  id: string;
  scope: ChatScope;
  senderId: string;
  recipientId?: string | undefined;
  roomId?: string | undefined;
  body: string;
  originalBody: string;
  filtered: boolean;
  blocked: boolean;
}

/**
 * Records the message. Blocked attempts are stored too, with the original text
 * and a `flagged` state, because a report is unjudgeable without the thing
 * that was actually typed.
 */
export async function persistMessage(args: PersistArgs): Promise<void> {
  await db.insert(chatMessages).values({
    id: args.id,
    scope: args.scope,
    roomId: args.roomId ?? null,
    senderId: args.senderId,
    recipientId: args.recipientId ?? null,
    body: args.blocked ? '' : args.body,
    // Only kept when the filter changed or refused something, so an ordinary
    // message is not stored twice.
    originalBody: args.filtered || args.blocked ? args.originalBody : null,
    wasFiltered: args.filtered || args.blocked,
    moderationState: args.blocked ? 'flagged' : 'ok',
    ...(args.blocked ? { deletedAt: new Date() } : {}),
  });
}

/**
 * Recent public backlog for a joining player, oldest first.
 *
 * Private messages are deliberately excluded: a hub join must never hand
 * someone else's direct messages to a new arrival.
 */
export async function loadGlobalHistory(
  limit = CHAT_HISTORY_LIMIT,
): Promise<ChatMessagePayload[]> {
  const rows = await db
    .select({
      id: chatMessages.id,
      scope: chatMessages.scope,
      senderId: chatMessages.senderId,
      senderName: users.displayName,
      body: chatMessages.body,
      wasFiltered: chatMessages.wasFiltered,
      createdAt: chatMessages.createdAt,
      deletedAt: chatMessages.deletedAt,
    })
    .from(chatMessages)
    .innerJoin(users, eq(users.id, chatMessages.senderId))
    .where(
      and(
        eq(chatMessages.scope, 'global'),
        isNull(chatMessages.deletedAt),
        or(eq(chatMessages.moderationState, 'ok'), isNull(chatMessages.moderationState)),
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(Math.min(Math.max(limit, 1), CHAT_HISTORY_LIMIT));

  return rows.reverse().map((row) => ({
    id: row.id,
    scope: row.scope,
    senderId: row.senderId,
    senderName: row.senderName,
    body: row.body,
    filtered: row.wasFiltered,
    sentAt: row.createdAt.getTime(),
  }));
}
