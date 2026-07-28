import { z } from 'zod';
import { CHAT_SCOPES } from './chat';

/**
 * Colyseus wire protocol.
 *
 * Every client -> server message is a *request*: the server decides the outcome
 * and broadcasts state. No message a client can send ever carries an outcome, a
 * balance, a position it expects to be believed, or a random result.
 *
 * The payload schemas below are the validation boundary. The room parses every
 * inbound message through them before touching any state - an unparsed message
 * is treated as a protocol violation, not as a best-effort value.
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
  chatHistory: 'chat_history',
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
 * Movement speeds. The client predicts with exactly these numbers, so a
 * mismatch shows up immediately as rubber-banding rather than as a silent
 * divergence.
 */
export const AVATAR_WALK_SPEED = 3.2; // m/s
export const AVATAR_RUN_SPEED = 6.4; // m/s
export const AVATAR_TURN_SPEED = 12; // rad/s, for smoothing the facing angle

/**
 * How far the server lets a single tick move a player before it stops
 * believing the clock. Guards against a client that batches input or lies
 * about elapsed time; the surplus is discarded, never applied.
 */
export const MAX_TICK_SECONDS = 0.25;

/** Per-action rate limits, enforced server side (messages per window). */
export const RATE_LIMITS = {
  chatSend: { points: 5, windowMs: 5_000 },
  emote: { points: 6, windowMs: 10_000 },
  teleportRequest: { points: 3, windowMs: 30_000 },
  equipRequest: { points: 10, windowMs: 60_000 },
  moveIntent: { points: 40, windowMs: 1_000 },
  ping: { points: 10, windowMs: 10_000 },
} as const;

export type RateLimitedAction = keyof typeof RATE_LIMITS;

/** How long a disconnected player keeps their seat before being dropped. */
export const RECONNECTION_WINDOW_SECONDS = 90;

export const CHAT_MAX_LENGTH = 240;

/** Emotes available in phase 1. More arrive with the shop in phase 7. */
export const EMOTES = ['wave', 'clap', 'dance', 'cheer', 'sit', 'laugh'] as const;
export type Emote = (typeof EMOTES)[number];

/** Italian labels for the emote bar. */
export const EMOTE_LABELS: Record<Emote, string> = {
  wave: 'Saluta',
  clap: 'Applaudi',
  dance: 'Balla',
  cheer: 'Esulta',
  sit: 'Siediti',
  laugh: 'Ridi',
};

/** How long an emote plays before the avatar returns to idle. */
export const EMOTE_DURATION_MS = 2_500;

/* -------------------------------------------------------------------------
 * Client -> server payloads
 * ---------------------------------------------------------------------- */

/**
 * A movement *intent*, not a position.
 *
 * `dirX`/`dirZ` is the direction the player is asking to move in world space;
 * the server normalises it, integrates it over the real elapsed time and
 * resolves collisions itself. `seq` comes back in the player's state so the
 * client can reconcile its prediction against what the server actually did.
 */
export const moveIntentSchema = z.object({
  seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  dirX: z.number().min(-1).max(1),
  dirZ: z.number().min(-1).max(1),
  run: z.boolean(),
  /** Desired facing in radians; purely cosmetic, still clamped. */
  facing: z.number().min(-Math.PI * 2).max(Math.PI * 2),
});

export const emoteSchema = z.object({
  emote: z.enum(EMOTES),
});

export const chatSendSchema = z.object({
  scope: z.enum(CHAT_SCOPES),
  body: z.string().trim().min(1).max(CHAT_MAX_LENGTH),
  /** Required for `private`, ignored otherwise. */
  recipientId: z.string().uuid().optional(),
});

export const teleportRequestSchema = z.object({
  poiId: z.string().min(1).max(64),
});

export const pingSchema = z.object({
  /** Client clock, echoed back untouched. Never used as a server timestamp. */
  clientTime: z.number(),
});

export type MoveIntent = z.infer<typeof moveIntentSchema>;
export type EmoteRequest = z.infer<typeof emoteSchema>;
export type ChatSendRequest = z.infer<typeof chatSendSchema>;
export type TeleportRequest = z.infer<typeof teleportRequestSchema>;

/* -------------------------------------------------------------------------
 * Server -> client payloads
 * ---------------------------------------------------------------------- */

export interface WelcomePayload {
  /** The joining player's own session id, so the client knows which is theirs. */
  sessionId: string;
  userId: string;
  displayName: string;
  serverTime: number;
  tickHz: number;
}

export interface ChatMessagePayload {
  id: string;
  scope: (typeof CHAT_SCOPES)[number];
  senderId: string;
  senderName: string;
  /** Present only on private messages. */
  recipientId?: string;
  body: string;
  /** True when the profanity filter changed the text before delivery. */
  filtered: boolean;
  sentAt: number;
}

export interface EmotePlayedPayload {
  sessionId: string;
  emote: Emote;
}

export interface TeleportAppliedPayload {
  poiId: string;
  x: number;
  z: number;
}

/** Why a request was refused. Stable codes; the client renders Italian copy. */
export const REJECTION_CODES = [
  'rate_limited',
  'invalid_payload',
  'unknown_target',
  'not_available_yet',
  'message_blocked',
  'not_allowed',
] as const;

export type RejectionCode = (typeof REJECTION_CODES)[number];

export interface ActionRejectedPayload {
  action: ClientMessage;
  code: RejectionCode;
  /** Milliseconds until the action is worth retrying, when applicable. */
  retryAfterMs?: number;
}

export interface PongPayload {
  clientTime: number;
  serverTime: number;
}
