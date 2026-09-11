import { Client, getStateCallbacks, type Room } from '@colyseus/sdk';
import {
  CLIENT_MESSAGES,
  ROOM_NAMES,
  SERVER_MESSAGES,
  type ChatMessagePayload,
  type ActionRejectedPayload,
  type Emote,
  type EmotePlayedPayload,
  type TeleportAppliedPayload,
  type WelcomePayload,
} from '@bingo/shared';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { wsOrigin } from '../lib/apiOrigin';

/**
 * The single connection to the hub.
 *
 * Kept as a module singleton rather than in React state on purpose: the room
 * is a live object mutated 20 times a second, and putting it through a store
 * would either re-render the tree at 20 Hz or force a copy of it every tick.
 * Components read positions imperatively in `useFrame`; only discrete events
 * (join, leave, chat, rejection) go through the store.
 */

/** Shape of a replicated player as the SDK reflects it back to us. */
export interface RemotePlayer {
  userId: string;
  displayName: string;
  level: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  moving: boolean;
  running: boolean;
  emote: string;
  lastSeq: number;
  connected: boolean;
  bodyType: string;
  skinTone: string;
  hairStyle: string;
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
  heightCm: number;
}

export interface HubStateView {
  players: Map<string, RemotePlayer> & {
    onAdd?: unknown;
  };
  tick: number;
}

export type HubRoom = Room<HubStateView>;

export interface HubHandlers {
  onWelcome: (payload: WelcomePayload) => void;
  onPlayerAdd: (sessionId: string, player: RemotePlayer) => void;
  onPlayerRemove: (sessionId: string) => void;
  onChat: (message: ChatMessagePayload) => void;
  onChatHistory: (messages: ChatMessagePayload[]) => void;
  onEmote: (payload: EmotePlayedPayload) => void;
  onTeleport: (payload: TeleportAppliedPayload) => void;
  onRejected: (payload: ActionRejectedPayload) => void;
  onStatus: (status: ConnectionStatus) => void;
}

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

/** Where the room's reconnection token is parked across a page reload. */
const RECONNECT_KEY = 'bingo.hub.reconnection';

/**
 * Where the hub lives.
 *
 * The server puts the API, matchmaking and the WebSocket upgrade on one port,
 * so this is the API origin with the scheme swapped - no separate host and no
 * hardcoded port. Behind TLS that means `wss://`, which is not optional: a
 * browser on an https page refuses to open a plaintext ws:// socket.
 *
 * `VITE_WS_URL` still overrides, for the case where the game server sits
 * behind a different hostname than the API.
 */
function wsEndpoint(): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, '');

  return wsOrigin();
}

let room: HubRoom | null = null;
let handlers: HubHandlers | null = null;
let deliberateLeave = false;
let reconnectAttempts = 0;
let connectionVersion = 0;

export function getRoom(): HubRoom | null {
  return room;
}

function attach(joined: HubRoom, version: number): void {
  room = joined;
  const active = () => version === connectionVersion && !deliberateLeave && room === joined;

  // `getStateCallbacks` is the supported way to observe a reflected schema.
  // Reading `room.state` directly at join time does not work: the first state
  // message has not arrived yet, so `state.players` is still undefined and
  // subscribing to it throws before the socket is even open.
  //
  // Only membership is observed here. Positions are read per frame straight
  // off `room.state` inside the render loop, so a walking crowd never touches
  // React.
  const $ = getStateCallbacks(joined);
  const root = $(joined.state) as unknown as {
    players: {
      onAdd: (cb: (player: RemotePlayer, key: string) => void) => void;
      onRemove: (cb: (player: RemotePlayer, key: string) => void) => void;
    };
  };

  root.players.onAdd((player, key) => active() && handlers?.onPlayerAdd(key, player));
  root.players.onRemove((_player, key) => active() && handlers?.onPlayerRemove(key));

  joined.onMessage(SERVER_MESSAGES.welcome, (payload: WelcomePayload) => {
    if (active()) handlers?.onWelcome(payload);
  });
  joined.onMessage(SERVER_MESSAGES.chatMessage, (payload: ChatMessagePayload) => {
    if (active()) handlers?.onChat(payload);
  });
  joined.onMessage(SERVER_MESSAGES.chatHistory, (payload: ChatMessagePayload[]) => {
    if (active()) handlers?.onChatHistory(payload);
  });
  joined.onMessage(SERVER_MESSAGES.emotePlayed, (payload: EmotePlayedPayload) => {
    if (active()) handlers?.onEmote(payload);
  });
  joined.onMessage(SERVER_MESSAGES.teleportApplied, (payload: TeleportAppliedPayload) => {
    if (active()) handlers?.onTeleport(payload);
  });
  joined.onMessage(SERVER_MESSAGES.actionRejected, (payload: ActionRejectedPayload) => {
    if (active()) handlers?.onRejected(payload);
  });

  sessionStorage.setItem(RECONNECT_KEY, joined.reconnectionToken);

  joined.onLeave((code) => {
    if (!active()) return;
    room = null;
    if (deliberateLeave) {
      handlers?.onStatus('disconnected');
      sessionStorage.removeItem(RECONNECT_KEY);
      return;
    }

    // 4001 is our own "superseded by a newer session" code: retrying would
    // just fight the other tab.
    if (code === 4001) {
      handlers?.onStatus('disconnected');
      sessionStorage.removeItem(RECONNECT_KEY);
      return;
    }

    handlers?.onStatus('reconnecting');
    void retryConnect(version);
  });
}

async function retryConnect(version: number): Promise<void> {
  if (version !== connectionVersion || deliberateLeave) return;
  const token = sessionStorage.getItem(RECONNECT_KEY);
  if (!token) {
    handlers?.onStatus('failed');
    return;
  }

  reconnectAttempts += 1;
  // Backoff, capped: the server holds the seat for 90 seconds, so there is no
  // point hammering it faster than that window can absorb.
  const delay = Math.min(1000 * 2 ** (reconnectAttempts - 1), 8000);
  await new Promise((resolve) => setTimeout(resolve, delay));
  if (version !== connectionVersion || deliberateLeave) return;

  try {
    const client = new Client(wsEndpoint());
    const rejoined = (await client.reconnect(token)) as unknown as HubRoom;
    if (version !== connectionVersion || deliberateLeave) { await rejoined.leave(true); return; }
    reconnectAttempts = 0;
    attach(rejoined, version);
    handlers?.onStatus('connected');
  } catch {
    if (version !== connectionVersion || deliberateLeave) return;
    if (reconnectAttempts >= 5) {
      handlers?.onStatus('failed');
      sessionStorage.removeItem(RECONNECT_KEY);
      return;
    }
    void retryConnect(version);
  }
}

export async function connectToHub(
  accessToken: string,
  next: HubHandlers,
): Promise<void> {
  const version = ++connectionVersion;
  const previous = room;
  room = null;
  if (previous) void previous.leave(true).catch(() => undefined);
  handlers = next;
  deliberateLeave = false;
  reconnectAttempts = 0;
  next.onStatus('connecting');
  const client = new Client(wsEndpoint());
  let joined: HubRoom;
  try {
    joined = (await client.joinOrCreate(ROOM_NAMES.hub, { accessToken })) as unknown as HubRoom;
  } catch (error) {
    if (version !== connectionVersion || deliberateLeave) return;
    const code = (error as { code?: number; status?: number } | null);
    if (code?.code !== 401 && code?.status !== 401) throw error;
    await api.me();
    if (version !== connectionVersion || deliberateLeave) return;
    const freshToken = useAuthStore.getState().accessToken;
    if (!freshToken || freshToken === accessToken) throw error;
    joined = (await client.joinOrCreate(ROOM_NAMES.hub, { accessToken: freshToken })) as unknown as HubRoom;
  }
  if (version !== connectionVersion || deliberateLeave) {
    await joined.leave(true);
    return;
  }
  attach(joined, version);
  next.onStatus('connected');
}

export async function leaveHub(): Promise<void> {
  deliberateLeave = true;
  connectionVersion += 1;
  sessionStorage.removeItem(RECONNECT_KEY);
  const previous = room;
  // Clear synchronously: completion of an old leave must not erase a new join.
  room = null;
  handlers = null;
  await previous?.leave(true);
}

/* ---------------------------------------------------------------------------
 * Outbound requests. Every one of these is a *request*: nothing here asserts a
 * position, an outcome or a balance.
 * ------------------------------------------------------------------------ */

export function sendMoveIntent(
  seq: number,
  dirX: number,
  dirZ: number,
  run: boolean,
  facing: number,
): void {
  room?.send(CLIENT_MESSAGES.moveIntent, { seq, dirX, dirZ, run, facing });
}

export function sendEmote(emote: Emote): void {
  room?.send(CLIENT_MESSAGES.emote, { emote });
}

export function sendChat(body: string, recipientId?: string): void {
  room?.send(CLIENT_MESSAGES.chatSend, {
    scope: recipientId ? 'private' : 'global',
    body,
    ...(recipientId ? { recipientId } : {}),
  });
}

export function sendTeleport(poiId: string): void {
  room?.send(CLIENT_MESSAGES.teleportRequest, { poiId });
}

export function sendPing(): void {
  room?.send(CLIENT_MESSAGES.ping, { clientTime: Date.now() });
}
