import { Room, ServerError, type Client } from 'colyseus';
import {
  AVATAR_RUN_SPEED,
  AVATAR_WALK_SPEED,
  CLIENT_MESSAGES,
  EMOTE_DURATION_MS,
  HUB_MAX_AVATARS,
  HUB_POIS,
  HUB_SPAWN_POINTS,
  HUB_TICK_MS,
  MAX_TICK_SECONDS,
  RECONNECTION_WINDOW_SECONDS,
  SERVER_MESSAGES,
  chatSendSchema,
  emoteSchema,
  moveIntentSchema,
  pingSchema,
  resolvePosition,
  teleportRequestSchema,
  type ActionRejectedPayload,
  type ChatMessagePayload,
  type ClientMessage,
  type EmotePlayedPayload,
  type MoveIntent,
  type PongPayload,
  type RateLimitedAction,
  type RejectionCode,
  type TeleportAppliedPayload,
  type UserRole,
  type WelcomePayload,
} from '@bingo/shared';
import type { ZodType } from 'zod';
import { verifyAccessToken } from '../auth/tokens';
import { loadPlayerProfile, type PlayerProfile } from '../services/players';
import { loadGlobalHistory, persistMessage, prepareMessage } from '../services/chat';
import { ActionRateLimiter } from './rateLimiter';
import { HubState, PlayerState } from './schema';
import { sanitizeError } from '../logging';

/**
 * The phase gate for points of interest. Bumped as each destination ships, so
 * the hub can already advertise where things will be without letting anyone
 * teleport into a room that does not exist.
 */
const CURRENT_PHASE = 1;

/**
 * A movement intent older than this is treated as "no input". Without it, a
 * player whose connection dies mid-stride keeps walking forever on the server.
 */
const INTENT_STALE_MS = 500;

/** Per-connection scratch state that must not be replicated to other players. */
interface Connection {
  userId: string;
  role: UserRole;
  limiter: ActionRateLimiter;
  intent: MoveIntent | null;
  intentAt: number;
  emoteExpiresAt: number;
  /** Rejected or malformed messages, for the anti-cheat signal in phase 8. */
  violations: number;
}

interface HubAuth {
  userId: string;
  role: UserRole;
  profile: PlayerProfile;
}

/**
 * The hub.
 *
 * Authority model, in one place so it cannot be misread:
 *  - the client never sends a position, only a *direction it wants to go*;
 *  - the server integrates that direction over its own clock, resolves it
 *    against the shared world geometry, and writes the result;
 *  - at most one intent is applied per tick, so flooding the socket buys no
 *    extra speed - movement is bounded by the server's clock, not by message
 *    rate. That is the property that makes a speed hack structurally
 *    impossible rather than merely detected.
 */
export class HubRoom extends Room<{ state: HubState }> {
  override maxClients = HUB_MAX_AVATARS;

  private readonly connections = new Map<string, Connection>();
  /** userId -> colyseus session id, for private messages and single-session. */
  private readonly bySessionUser = new Map<string, string>();

  override onCreate(): void {
    this.state = new HubState();
    // `schema()` fields have no class-level defaults: anything not assigned
    // here arrives at the client as undefined, and `undefined + 1` is NaN.
    this.state.tick = 0;
    this.autoDispose = false;

    this.onMessage(CLIENT_MESSAGES.moveIntent, (client, payload: unknown) => {
      this.handle(client, CLIENT_MESSAGES.moveIntent, 'moveIntent', moveIntentSchema, payload, (intent, connection) => {
        connection.intent = intent;
        connection.intentAt = Date.now();
      });
    });

    this.onMessage(CLIENT_MESSAGES.emote, (client, payload: unknown) => {
      this.handle(client, CLIENT_MESSAGES.emote, 'emote', emoteSchema, payload, (request, connection) => {
        const player = this.state.players.get(client.sessionId);
        if (!player) return;
        player.emote = request.emote;
        connection.emoteExpiresAt = Date.now() + EMOTE_DURATION_MS;

        const payloadOut: EmotePlayedPayload = {
          sessionId: client.sessionId,
          emote: request.emote,
        };
        this.broadcast(SERVER_MESSAGES.emotePlayed, payloadOut);
      });
    });

    this.onMessage(CLIENT_MESSAGES.teleportRequest, (client, payload: unknown) => {
      this.handle(
        client,
        CLIENT_MESSAGES.teleportRequest,
        'teleportRequest',
        teleportRequestSchema,
        payload,
        (request) => {
          const poi = HUB_POIS.find((candidate) => candidate.id === request.poiId);
          if (!poi) {
            this.reject(client, CLIENT_MESSAGES.teleportRequest, 'unknown_target');
            return;
          }
          if (poi.availableFromPhase > CURRENT_PHASE) {
            this.reject(client, CLIENT_MESSAGES.teleportRequest, 'not_available_yet');
            return;
          }

          const player = this.state.players.get(client.sessionId);
          if (!player) return;

          const resolved = resolvePosition(poi.standX, poi.standZ);
          player.x = resolved.x;
          player.z = resolved.z;
          player.moving = false;
          player.running = false;

          const applied: TeleportAppliedPayload = {
            poiId: poi.id,
            x: resolved.x,
            z: resolved.z,
          };
          client.send(SERVER_MESSAGES.teleportApplied, applied);
        },
      );
    });

    this.onMessage(CLIENT_MESSAGES.chatSend, (client, payload: unknown) => {
      this.handle(client, CLIENT_MESSAGES.chatSend, 'chatSend', chatSendSchema, payload, (request) => {
        void this.deliverChat(client, request.scope, request.body, request.recipientId);
      });
    });

    this.onMessage(CLIENT_MESSAGES.ping, (client, payload: unknown) => {
      this.handle(client, CLIENT_MESSAGES.ping, 'ping', pingSchema, payload, (request) => {
        const pong: PongPayload = { clientTime: request.clientTime, serverTime: Date.now() };
        client.send(SERVER_MESSAGES.pong, pong);
      });
    });

    this.setSimulationInterval((deltaMs) => this.update(deltaMs), HUB_TICK_MS);
  }

  /**
   * Identity comes from the signed access token and nothing else. The join
   * options may claim anything they like; only `accessToken` is read.
   */
  override async onAuth(_client: Client, options: unknown): Promise<HubAuth> {
    const token =
      typeof options === 'object' && options !== null
        ? (options as { accessToken?: unknown }).accessToken
        : undefined;

    if (typeof token !== 'string' || token.length === 0) {
      throw new ServerError(401, 'unauthorized');
    }

    const claims = await verifyAccessToken(token);
    const profile = await loadPlayerProfile(claims.sub);

    if (!profile) throw new ServerError(401, 'unauthorized');
    if (profile.status !== 'active') throw new ServerError(403, 'account_suspended');

    return { userId: claims.sub, role: claims.role, profile };
  }

  override onJoin(client: Client): void {
    const auth = client.auth as HubAuth | undefined;
    if (!auth) {
      client.leave(401);
      return;
    }

    // One avatar per account. A second join supersedes the previous session,
    // whether it is still live (another tab) or waiting out its reconnection
    // window - otherwise a refresh leaves a ghost standing in the plaza.
    const previous = this.bySessionUser.get(auth.userId);
    if (previous && previous !== client.sessionId) {
      const previousClient = this.clients.find((candidate) => candidate.sessionId === previous);
      previousClient?.leave(4001);
      this.removePlayer(previous);
    }

    const spawn = this.pickSpawn();
    const appearance = auth.profile.appearance;

    // Every field is set explicitly: a `schema()` type has no class defaults,
    // so an omitted field replicates as undefined and breaks arithmetic and
    // rendering alike on the client.
    const player = new PlayerState({
      userId: auth.userId,
      displayName: auth.profile.displayName,
      level: auth.profile.level,

      x: spawn.x,
      y: 0,
      z: spawn.z,
      rotY: spawn.rotY,

      moving: false,
      running: false,
      emote: '',
      lastSeq: 0,
      connected: true,

      bodyType: appearance.bodyType,
      skinTone: appearance.skinTone,
      hairStyle: appearance.hairStyle,
      hairColor: appearance.hairColor,
      shirtColor: appearance.shirtColor,
      pantsColor: appearance.pantsColor,
      heightCm: appearance.heightCm,
    });

    this.state.players.set(client.sessionId, player);
    this.connections.set(client.sessionId, {
      userId: auth.userId,
      role: auth.role,
      limiter: new ActionRateLimiter(),
      intent: null,
      intentAt: 0,
      emoteExpiresAt: 0,
      violations: 0,
    });
    this.bySessionUser.set(auth.userId, client.sessionId);

    const welcome: WelcomePayload = {
      sessionId: client.sessionId,
      userId: auth.userId,
      displayName: auth.profile.displayName,
      serverTime: Date.now(),
      tickHz: 1000 / HUB_TICK_MS,
    };
    client.send(SERVER_MESSAGES.welcome, welcome);

    // Backlog is best-effort: a database hiccup must not block the join.
    void loadGlobalHistory()
      .then((history) => client.send(SERVER_MESSAGES.chatHistory, history))
      .catch((error: unknown) => {
        this.logError('Failed to load chat history', error);
      });
  }

  /**
   * Disconnected without consent. Hold the seat so cartelle, position and
   * chat context survive a tunnel or a dropped wifi.
   */
  override async onDrop(client: Client): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;

    try {
      await this.allowReconnection(client, RECONNECTION_WINDOW_SECONDS);
    } catch {
      // Window expired; onLeave performs the actual removal.
    }
  }

  override onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;

    // Stale input must not resume on reconnect: the avatar would take a step
    // for every second the player was offline.
    const connection = this.connections.get(client.sessionId);
    if (connection) {
      connection.intent = null;
      connection.intentAt = 0;
    }
  }

  override onLeave(client: Client): void {
    this.removePlayer(client.sessionId);
  }

  /* --------------------------------------------------------------------- */

  private removePlayer(sessionId: string): void {
    const connection = this.connections.get(sessionId);
    if (connection && this.bySessionUser.get(connection.userId) === sessionId) {
      this.bySessionUser.delete(connection.userId);
    }
    this.connections.delete(sessionId);
    this.state.players.delete(sessionId);
  }

  /** Spreads arrivals over the spawn ring instead of stacking them. */
  private pickSpawn(): { x: number; z: number; rotY: number } {
    let best = HUB_SPAWN_POINTS[0] as { x: number; z: number; rotY: number };
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidate of HUB_SPAWN_POINTS) {
      let crowding = 0;
      for (const [, player] of this.state.players) {
        const dx = player.x - candidate.x;
        const dz = player.z - candidate.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq < 9) crowding += 9 - distanceSq;
      }
      if (crowding < bestScore) {
        bestScore = crowding;
        best = candidate;
      }
    }

    return best;
  }

  /**
   * Single entry point for every inbound message: rate limit, then validate,
   * then act. Doing it in one place is what makes "every message is validated"
   * a property of the room rather than a habit of whoever wrote the handler.
   */
  private handle<T>(
    client: Client,
    action: ClientMessage,
    limit: RateLimitedAction,
    schema: ZodType<T>,
    payload: unknown,
    run: (value: T, connection: Connection) => void,
  ): void {
    const connection = this.connections.get(client.sessionId);
    if (!connection) return;

    const retryAfterMs = connection.limiter.check(limit);
    if (retryAfterMs !== null) {
      connection.violations += 1;
      this.reject(client, action, 'rate_limited', retryAfterMs);
      return;
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      connection.violations += 1;
      this.reject(client, action, 'invalid_payload');
      return;
    }

    try {
      run(parsed.data, connection);
    } catch (error) {
      this.logError(`Handler for ${action} threw`, error);
    }
  }

  private reject(
    client: Client,
    action: ClientMessage,
    code: RejectionCode,
    retryAfterMs?: number,
  ): void {
    const payload: ActionRejectedPayload = {
      action,
      code,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
    client.send(SERVER_MESSAGES.actionRejected, payload);
  }

  private async deliverChat(
    client: Client,
    scope: 'global' | 'room' | 'private',
    rawBody: string,
    recipientId?: string,
  ): Promise<void> {
    const connection = this.connections.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!connection || !player) return;

    // `room` scope belongs to bingo halls and slot arcades, which arrive in
    // phase 2. In the hub it would be indistinguishable from `global`.
    if (scope === 'room') {
      this.reject(client, CLIENT_MESSAGES.chatSend, 'not_available_yet');
      return;
    }

    if (scope === 'private' && !recipientId) {
      this.reject(client, CLIENT_MESSAGES.chatSend, 'invalid_payload');
      return;
    }

    const prepared = prepareMessage(rawBody);

    if (prepared.blocked) {
      this.reject(client, CLIENT_MESSAGES.chatSend, 'message_blocked');
      void persistMessage({
        id: prepared.id,
        scope,
        senderId: connection.userId,
        recipientId,
        body: '',
        originalBody: rawBody,
        filtered: true,
        blocked: true,
      }).catch((error: unknown) => this.logError('Failed to record blocked message', error));
      return;
    }

    const message: ChatMessagePayload = {
      id: prepared.id,
      scope,
      senderId: connection.userId,
      senderName: player.displayName,
      ...(scope === 'private' && recipientId ? { recipientId } : {}),
      body: prepared.body,
      filtered: prepared.filtered,
      sentAt: Date.now(),
    };

    if (scope === 'private') {
      const targetSession = recipientId ? this.bySessionUser.get(recipientId) : undefined;
      if (!targetSession) {
        this.reject(client, CLIENT_MESSAGES.chatSend, 'unknown_target');
        return;
      }
      const targetClient = this.clients.find(
        (candidate) => candidate.sessionId === targetSession,
      );
      targetClient?.send(SERVER_MESSAGES.chatMessage, message);
      // Echo to the sender so their own message appears in their thread.
      client.send(SERVER_MESSAGES.chatMessage, message);
    } else {
      this.broadcast(SERVER_MESSAGES.chatMessage, message);
    }

    // Delivery is what players experience; persistence is bookkeeping and must
    // never delay it or fail the send.
    void persistMessage({
      id: prepared.id,
      scope,
      senderId: connection.userId,
      recipientId,
      body: prepared.body,
      originalBody: rawBody,
      filtered: prepared.filtered,
      blocked: false,
    }).catch((error: unknown) => this.logError('Failed to persist chat message', error));
  }

  /**
   * One simulation step. `deltaMs` comes from the server's own clock and is
   * clamped, so neither a slow tick nor a lying client can produce a long step.
   */
  private update(deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, MAX_TICK_SECONDS);
    const now = Date.now();
    this.state.tick = (this.state.tick + 1) % 0xffffffff;

    for (const [sessionId, player] of this.state.players) {
      const connection = this.connections.get(sessionId);
      if (!connection) continue;

      if (player.emote && connection.emoteExpiresAt <= now) {
        player.emote = '';
      }

      const intent = connection.intent;
      const stale = !intent || now - connection.intentAt > INTENT_STALE_MS;

      if (stale) {
        if (player.moving) {
          player.moving = false;
          player.running = false;
        }
        continue;
      }

      player.lastSeq = intent.seq;
      player.rotY = intent.facing;

      // Normalise rather than trust: a client sending (1, 1) would otherwise
      // travel 1.41x faster on the diagonal.
      const magnitude = Math.hypot(intent.dirX, intent.dirZ);
      if (magnitude < 0.01) {
        player.moving = false;
        player.running = false;
        continue;
      }

      const dirX = intent.dirX / magnitude;
      const dirZ = intent.dirZ / magnitude;
      const speed = intent.run ? AVATAR_RUN_SPEED : AVATAR_WALK_SPEED;

      const resolved = resolvePosition(
        player.x + dirX * speed * dt,
        player.z + dirZ * speed * dt,
      );

      player.x = resolved.x;
      player.z = resolved.z;
      player.moving = true;
      player.running = intent.run;
    }
  }

  private logError(message: string, error: unknown): void {
    // Room logging goes through the same sanitiser as the HTTP layer so a
    // failed query cannot dump its bound parameters here either.
    console.error(message, sanitizeError(error));
  }
}
