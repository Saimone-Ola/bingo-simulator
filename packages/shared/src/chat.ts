/**
 * Chat vocabulary, shared by the database enum, the room and the client.
 */
export const CHAT_SCOPES = ['global', 'room', 'private'] as const;
export type ChatScope = (typeof CHAT_SCOPES)[number];

/** Italian labels for the chat tabs. */
export const CHAT_SCOPE_LABELS: Record<ChatScope, string> = {
  global: 'Globale',
  room: 'Sala',
  private: 'Privato',
};

/** How much backlog a joining player receives. */
export const CHAT_HISTORY_LIMIT = 40;
