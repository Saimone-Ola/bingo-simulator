/**
 * Colyseus wire protocol.
 *
 * Phase 0 only pins down the vocabulary so client and server cannot drift once
 * the hub room lands in phase 1. Every client -> server message is a *request*:
 * the server decides the outcome and broadcasts state. No message a client can
 * send ever carries an outcome, a balance or a random result.
 */

export const ROOM_NAMES = {
  hub: 'hub',
  bingo: 'bingo',
  slots: 'slots',
} as const;

export type RoomName = (typeof ROOM_NAMES)[keyof typeof ROOM_NAMES];

/** Client -> server. Named requests, never assertions of fact. */
export const CLIENT_MESSAGES = {
  /** Desired movement input for this tick (server integrates and validates). */
  moveIntent: 'move_intent',
  emote: 'emote',
  chatSend: 'chat_send',
  teleportRequest: 'teleport_request',
  equipRequest: 'equip_request',
  ping: 'ping',
} as const;

/** Server -> client. Authoritative facts. */
export const SERVER_MESSAGES = {
  welcome: 'welcome',
  chatMessage: 'chat_message',
  emotePlayed: 'emote_played',
  teleportApplied: 'teleport_applied',
  /** A request was rejected: code + optional retry hint. */
  actionRejected: 'action_rejected',
  balanceChanged: 'balance_changed',
  pong: 'pong',
} as const;

export type ClientMessage = (typeof CLIENT_MESSAGES)[keyof typeof CLIENT_MESSAGES];
export type ServerMessage = (typeof SERVER_MESSAGES)[keyof typeof SERVER_MESSAGES];

/** Server simulation rate for the hub. */
export const HUB_TICK_HZ = 20;
export const HUB_TICK_MS = 1000 / HUB_TICK_HZ;

/**
 * Plausibility bounds for avatar movement. The server clamps to these and
 * flags repeat offenders; the client uses them so prediction matches.
 */
export const AVATAR_WALK_SPEED = 3.2; // m/s
export const AVATAR_RUN_SPEED = 6.4; // m/s
/** Extra headroom before a movement delta is treated as a teleport attempt. */
export const AVATAR_SPEED_TOLERANCE = 1.25;

/** Per-action rate limits, enforced server side (messages per window). */
export const RATE_LIMITS = {
  chatSend: { points: 5, windowMs: 5_000 },
  emote: { points: 6, windowMs: 10_000 },
  teleportRequest: { points: 3, windowMs: 30_000 },
  equipRequest: { points: 10, windowMs: 60_000 },
  moveIntent: { points: 40, windowMs: 1_000 },
} as const;

/** How long a disconnected player keeps their seat before being dropped. */
export const RECONNECTION_WINDOW_SECONDS = 90;

export const CHAT_MAX_LENGTH = 240;
