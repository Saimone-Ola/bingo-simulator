import { Client, type Room } from "@colyseus/sdk";
import {
  BINGO_CLIENT_MESSAGES,
  BINGO_SERVER_MESSAGES,
  ROOM_NAMES,
  normaliseBingoRoomCode,
  type BingoActionRejectedPayload,
  type BingoBallCalledPayload,
  type BingoClaimRejectedPayload,
  type BingoClaimTier,
  type BingoMarkingMode,
  type BingoPurchaseConfirmedPayload,
  type BingoSeatRejectedPayload,
  type BingoSeatingPayload,
  type BingoSnapshotPayload,
  type BingoWinnerPayload,
  type RoomBingoConfig,
} from "@bingo/shared";
import { wsOrigin } from "../lib/apiOrigin";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { snapshotIssue, type BingoConnectionIssue } from './bingoProtocol';
import {
  clearBingoEventSnapshot,
  publishBingoEventSnapshot,
} from "./bingoEventBus";

export type BingoConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";

export interface BingoHandlers {
  onConnectionIssue?: (issue: BingoConnectionIssue) => void;
  onStatus: (status: BingoConnectionStatus) => void;
  onSnapshot: (payload: BingoSnapshotPayload) => void;
  onBall: (payload: BingoBallCalledPayload) => void;
  onWinner: (payload: BingoWinnerPayload) => void;
  onClaimRejected: (payload: BingoClaimRejectedPayload) => void;
  onActionRejected: (payload: BingoActionRejectedPayload) => void;
  onPurchaseConfirmed: (payload: BingoPurchaseConfirmedPayload) => void;
  onPurchaseWaiting: () => void;
  onRoundCancelled?: (payload: { roundId: string; round: number }) => void;
  /** Seating chart, sent on its own whenever anyone sits, stands or lapses. */
  onSeating: (payload: BingoSeatingPayload) => void;
  onSeatRejected: (payload: BingoSeatRejectedPayload) => void;
}

function endpoint(): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  return configured ? configured.replace(/\/$/, "") : wsOrigin();
}

function requestId(prefix: string): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

function isUnauthorized(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const response = error as { code?: unknown; status?: unknown };
  return response.code === 401 || response.status === 401;
}

let room: Room | null = null;
let deliberateLeave = false;
let connectionVersion = 0;
let reconnectTimer: number | null = null;
let snapshotTimer: number | null = null;
let currentRoundId: string | null = null;
let currentHandlers: BingoHandlers | null = null;
let preparing = false;

interface QueuedMessage {
  type: string;
  payload: unknown;
}

interface PendingPurchase {
  payload: {
    quantity: number;
    markingMode: BingoMarkingMode;
    requestId: string;
    roundId: string;
  };
  attempts: number;
  timer: number | null;
}

const queuedMessages: QueuedMessage[] = [];
let pendingPurchase: PendingPurchase | null = null;
const INITIAL_CONNECT_DELAYS_MS = [0, 1_200, 2_500, 5_000] as const;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function sendBingoMessage(type: string, payload: unknown): void {
  if (
    room &&
    (type !== BINGO_CLIENT_MESSAGES.purchaseCards || currentRoundId)
  ) {
    room.send(type, payload);
    return;
  }
  if (!deliberateLeave && type === BINGO_CLIENT_MESSAGES.purchaseCards) {
    const request = payload as { requestId?: unknown };
    const alreadyQueued =
      typeof request.requestId === "string" &&
      queuedMessages.some((message) => {
        const queued = message.payload as { requestId?: unknown };
        return message.type === type && queued.requestId === request.requestId;
      });
    if (!alreadyQueued) queuedMessages.push({ type, payload });
    if (queuedMessages.length > 40) queuedMessages.shift();
  }
}

function clearPendingPurchase(): void {
  if (pendingPurchase?.timer !== null && pendingPurchase?.timer !== undefined) {
    window.clearTimeout(pendingPurchase.timer);
  }
  pendingPurchase = null;
}

function schedulePurchaseRetry(): void {
  if (!pendingPurchase || pendingPurchase.attempts >= 8) {
    if (pendingPurchase?.attempts && pendingPurchase.attempts >= 8)
      currentHandlers?.onPurchaseWaiting();
    return;
  }
  if (pendingPurchase.timer !== null)
    window.clearTimeout(pendingPurchase.timer);
  pendingPurchase.timer = window.setTimeout(() => {
    if (!pendingPurchase || deliberateLeave) return;
    pendingPurchase.attempts += 1;
    sendBingoMessage(
      BINGO_CLIENT_MESSAGES.purchaseCards,
      pendingPurchase.payload,
    );
    schedulePurchaseRetry();
  }, 2_500);
}

export async function connectToBingo(
  accessToken: string,
  requestedCode: string,
  handlers: BingoHandlers,
): Promise<void> {
  deliberateLeave = false;
  const version = ++connectionVersion;
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  handlers.onStatus("connecting");
  if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
  snapshotTimer = null;
  currentHandlers = handlers;
  currentRoundId = null;

  const roomCode = normaliseBingoRoomCode(requestedCode);
  let joined: Room | null = null;
  let lastError: unknown = null;
  let joinAccessToken = accessToken;
  let authorizationRetried = false;

  for (let attempt = 0; attempt < INITIAL_CONNECT_DELAYS_MS.length; attempt += 1) {
    if (deliberateLeave || version !== connectionVersion)
      return;
    const delayMs = INITIAL_CONNECT_DELAYS_MS[attempt]!;
    if (delayMs > 0) await wait(delayMs);
    if (deliberateLeave || version !== connectionVersion)
      return;

    try {
      const client = new Client(endpoint());
      joined = await client.joinOrCreate(ROOM_NAMES.bingo, {
        accessToken: joinAccessToken,
        roomCode,
      });
      break;
    } catch (error) {
      lastError = error;
      if (isUnauthorized(error)) {
        if (authorizationRetried) break;
        authorizationRetried = true;
        try {
          // Use the HTTP broker's existing single-flight token rotation. Its
          // store update can start a newer React connection while this awaits.
          await api.me();
          if (deliberateLeave || version !== connectionVersion) return;
          const refreshedToken = useAuthStore.getState().accessToken;
          if (!refreshedToken || refreshedToken === joinAccessToken) break;
          joinAccessToken = refreshedToken;
          attempt -= 1; // Auth recovery does not consume a network retry.
        } catch (refreshError) {
          lastError = refreshError;
          break;
        }
      }
    }
  }

  if (version !== connectionVersion || deliberateLeave) {
    await joined?.leave(true);
    return;
  }
  if (!joined) {
    handlers.onConnectionIssue?.('network');
    handlers.onStatus("failed");
    throw lastError instanceof Error
      ? lastError
      : new Error("Unable to reach the Bingo server");
  }
  room = joined;
  let receivedSnapshot = false;
  const rejectSnapshot = (issue: BingoConnectionIssue) => {
    if (version !== connectionVersion || deliberateLeave) return;
    if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
    snapshotTimer = null;
    // Invalidate late messages before leaving. Never replay purchases to an
    // older server which cannot provide persistent purchase acknowledgements.
    connectionVersion += 1;
    room = null;
    currentRoundId = null;
    clearBingoEventSnapshot();
    handlers.onConnectionIssue?.(issue);
    handlers.onStatus('failed');
    void joined.leave(true).catch(() => undefined);
  };
  snapshotTimer = window.setTimeout(() => rejectSnapshot('snapshot_timeout'), 15_000);

  joined.onMessage(
    BINGO_SERVER_MESSAGES.snapshot,
    (payload: BingoSnapshotPayload) => {
      if (version !== connectionVersion || deliberateLeave) return;
      const issue = snapshotIssue(payload);
      if (issue) { rejectSnapshot(issue); return; }
      if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
      snapshotTimer = null;
      currentRoundId = payload.roundId;
      if (
        pendingPurchase &&
        pendingPurchase.payload.roundId !== payload.roundId
      ) {
        clearPendingPurchase();
        queuedMessages.length = 0;
        handlers.onActionRejected({
          action: "purchaseCards",
          reason: "wrong_phase",
        });
      }
      if (!receivedSnapshot) {
        receivedSnapshot = true;
        handlers.onStatus('connected');
        joined.send(BINGO_CLIENT_MESSAGES.setPreparing, { preparing });
        queuedMessages.length = 0;
        if (pendingPurchase) {
          pendingPurchase.attempts = 1;
          joined.send(
            BINGO_CLIENT_MESSAGES.purchaseCards,
            pendingPurchase.payload,
          );
          schedulePurchaseRetry();
        }
      }
      publishBingoEventSnapshot(payload);
      handlers.onSnapshot(payload);
    },
  );
  joined.onMessage(
    BINGO_SERVER_MESSAGES.purchaseConfirmed,
    (payload: BingoPurchaseConfirmedPayload) => {
      if (version !== connectionVersion || deliberateLeave) return;
      if (payload.requestId !== pendingPurchase?.payload.requestId) return;
      clearPendingPurchase();
      handlers.onPurchaseConfirmed(payload);
    },
  );
  joined.onMessage(
    BINGO_SERVER_MESSAGES.roundCancelled,
    (payload: { roundId: string; round: number }) => {
      if (version !== connectionVersion || deliberateLeave) return;
      clearPendingPurchase();
      queuedMessages.length = 0;
      handlers.onRoundCancelled?.(payload);
    },
  );
  joined.onMessage(
    BINGO_SERVER_MESSAGES.seating,
    (payload: BingoSeatingPayload) => {
      if (version === connectionVersion && !deliberateLeave)
        handlers.onSeating(payload);
    },
  );
  joined.onMessage(
    BINGO_SERVER_MESSAGES.seatRejected,
    (payload: BingoSeatRejectedPayload) => {
      if (version === connectionVersion && !deliberateLeave)
        handlers.onSeatRejected(payload);
    },
  );
  joined.onMessage(
    BINGO_SERVER_MESSAGES.ballCalled,
    (payload: BingoBallCalledPayload) => {
      if (version === connectionVersion && !deliberateLeave)
        handlers.onBall(payload);
    },
  );
  joined.onMessage(
    BINGO_SERVER_MESSAGES.winner,
    (payload: BingoWinnerPayload) => {
      if (version === connectionVersion && !deliberateLeave)
        handlers.onWinner(payload);
    },
  );
  joined.onMessage(
    BINGO_SERVER_MESSAGES.claimRejected,
    (payload: BingoClaimRejectedPayload) => {
      if (version === connectionVersion && !deliberateLeave)
        handlers.onClaimRejected(payload);
    },
  );
  joined.onMessage(
    BINGO_SERVER_MESSAGES.actionRejected,
    (payload: BingoActionRejectedPayload) => {
      if (version !== connectionVersion || deliberateLeave) return;
      if (
        payload.action === "purchaseCards" &&
        payload.requestId &&
        payload.requestId !== pendingPurchase?.payload.requestId
      )
        return;
      if (
        payload.action === "purchaseCards" &&
        payload.reason !== "purchase_in_progress" &&
        payload.reason !== "purchase_failed" &&
        (!payload.requestId ||
          payload.requestId === pendingPurchase?.payload.requestId)
      ) {
        clearPendingPurchase();
      }
      handlers.onActionRejected(payload);
    },
  );

  joined.onLeave((code) => {
    if (version !== connectionVersion) return;
    if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
    snapshotTimer = null;
    room = null;
    currentRoundId = null;
    clearBingoEventSnapshot();
    if (deliberateLeave || code === 4001) {
      handlers.onStatus("disconnected");
      return;
    }

    handlers.onStatus("connecting");
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      if (deliberateLeave || version !== connectionVersion) return;
      void connectToBingo(joinAccessToken, roomCode, handlers).catch(() => {
        if (!deliberateLeave) handlers.onStatus("failed");
      });
    }, 750);
  });

  // A WebSocket alone does not mean the room is ready: wait for its snapshot.
}

export function purchaseBingoCards(
  quantity: number,
  markingMode: BingoMarkingMode,
): boolean {
  if (!room || !currentRoundId) return false;
  if (pendingPurchase) {
    pendingPurchase.attempts = 1;
    sendBingoMessage(
      BINGO_CLIENT_MESSAGES.purchaseCards,
      pendingPurchase.payload,
    );
    schedulePurchaseRetry();
    return true;
  }
  pendingPurchase = {
    payload: {
      quantity,
      markingMode,
      requestId: requestId("purchase"),
      roundId: currentRoundId,
    },
    attempts: 1,
    timer: null,
  };
  sendBingoMessage(
    BINGO_CLIENT_MESSAGES.purchaseCards,
    pendingPurchase.payload,
  );
  schedulePurchaseRetry();
  return true;
}

export function setBingoReady(ready: boolean): void {
  sendBingoMessage(BINGO_CLIENT_MESSAGES.setReady, { ready });
}

export function updateBingoConfig(
  config: Pick<
    RoomBingoConfig,
    | "startMode"
    | "countdownSeconds"
    | "numberCallInterval"
    | "crowdDensity"
    | "tier"
    | "chaosLevel"
    | "training"
  >,
): void {
  sendBingoMessage(BINGO_CLIENT_MESSAGES.updateConfig, config);
}

export function startBingoGame(): void {
  sendBingoMessage(BINGO_CLIENT_MESSAGES.startGame, {});
}

export function cancelBingoStart(): void {
  sendBingoMessage(BINGO_CLIENT_MESSAGES.cancelStart, {});
}

export function setBingoPreparing(value: boolean): void {
  preparing = value;
  sendBingoMessage(BINGO_CLIENT_MESSAGES.setPreparing, { preparing });
}

export function cancelBingoRound(): void {
  sendBingoMessage(BINGO_CLIENT_MESSAGES.cancelRound, {});
}

export function markBingoCell(
  round: number,
  cardIndex: number,
  cellIndex: number,
  marked: boolean,
): void {
  if (!currentRoundId) return;
  sendBingoMessage(BINGO_CLIENT_MESSAGES.markCell, {
    round,
    roundId: currentRoundId,
    cardIndex,
    cellIndex,
    marked,
  });
}

export function claimBingo(
  round: number,
  tier: BingoClaimTier,
  cardIndex: number,
): void {
  sendBingoMessage(BINGO_CLIENT_MESSAGES.claim, {
    round,
    roundId: currentRoundId,
    tier,
    cardIndex,
    requestId: requestId("claim"),
  });
}

/* --- Seats. The server owns occupancy; these only ask. --- */

export function takeBingoSeat(seatId: string): void {
  sendBingoMessage(BINGO_CLIENT_MESSAGES.takeSeat, { seatId });
}

export function leaveBingoSeat(): void {
  sendBingoMessage(BINGO_CLIENT_MESSAGES.leaveSeat, {});
}

export function reserveBingoSeat(seatId: string): void {
  sendBingoMessage(BINGO_CLIENT_MESSAGES.reserveSeat, { seatId });
}

export function cancelBingoSeatReservation(seatId: string): void {
  sendBingoMessage(BINGO_CLIENT_MESSAGES.cancelReservation, { seatId });
}

export async function leaveBingo(): Promise<void> {
  deliberateLeave = true;
  connectionVersion += 1;
  queuedMessages.length = 0;
  clearPendingPurchase();
  clearBingoEventSnapshot();
  if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
  snapshotTimer = null;
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const activeRoom = room;
  room = null;
  currentRoundId = null;
  currentHandlers = null;
  await activeRoom?.leave(true);
}
