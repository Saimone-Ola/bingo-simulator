import { Client, type Room } from '@colyseus/sdk';
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
  type BingoSnapshotPayload,
  type BingoWinnerPayload,
  type RoomBingoConfig,
} from '@bingo/shared';
import { wsOrigin } from '../lib/apiOrigin';

export type BingoConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface BingoHandlers {
  onStatus: (status: BingoConnectionStatus) => void;
  onSnapshot: (payload: BingoSnapshotPayload) => void;
  onBall: (payload: BingoBallCalledPayload) => void;
  onWinner: (payload: BingoWinnerPayload) => void;
  onClaimRejected: (payload: BingoClaimRejectedPayload) => void;
  onActionRejected: (payload: BingoActionRejectedPayload) => void;
}

function endpoint(): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  return configured ? configured.replace(/\/$/, '') : wsOrigin();
}

function requestId(prefix: string): string {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

let room: Room | null = null;
let deliberateLeave = false;
let connectionVersion = 0;
let reconnectTimer: number | null = null;

interface QueuedMessage {
  type: string;
  payload: unknown;
}

interface PendingPurchase {
  payload: {
    quantity: number;
    markingMode: BingoMarkingMode;
    requestId: string;
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
  if (room) {
    room.send(type, payload);
    return;
  }
  if (!deliberateLeave) {
    const request = payload as { requestId?: unknown };
    const alreadyQueued =
      typeof request.requestId === 'string' &&
      queuedMessages.some((message) => {
        const queued = message.payload as { requestId?: unknown };
        return message.type === type && queued.requestId === request.requestId;
      });
    if (!alreadyQueued) queuedMessages.push({ type, payload });
    if (queuedMessages.length > 40) queuedMessages.shift();
  }
}

function flushQueuedMessages(joined: Room): void {
  const pending = queuedMessages.splice(0);
  for (const message of pending) joined.send(message.type, message.payload);
}

function clearPendingPurchase(): void {
  if (pendingPurchase?.timer !== null && pendingPurchase?.timer !== undefined) {
    window.clearTimeout(pendingPurchase.timer);
  }
  pendingPurchase = null;
}

function schedulePurchaseRetry(): void {
  if (!pendingPurchase || pendingPurchase.attempts >= 8) {
    if (pendingPurchase?.attempts && pendingPurchase.attempts >= 8) clearPendingPurchase();
    return;
  }
  if (pendingPurchase.timer !== null) window.clearTimeout(pendingPurchase.timer);
  pendingPurchase.timer = window.setTimeout(() => {
    if (!pendingPurchase || deliberateLeave) return;
    pendingPurchase.attempts += 1;
    sendBingoMessage(BINGO_CLIENT_MESSAGES.purchaseCards, pendingPurchase.payload);
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
  handlers.onStatus('connecting');

  const roomCode = normaliseBingoRoomCode(requestedCode);
  let joined: Room | null = null;
  let lastError: unknown = null;

  for (const delayMs of INITIAL_CONNECT_DELAYS_MS) {
    if (deliberateLeave || version !== connectionVersion) throw new Error('Bingo connection cancelled');
    if (delayMs > 0) await wait(delayMs);
    if (deliberateLeave || version !== connectionVersion) throw new Error('Bingo connection cancelled');

    try {
      const client = new Client(endpoint());
      joined = await client.joinOrCreate(ROOM_NAMES.bingo, {
        accessToken,
        roomCode,
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!joined) {
    handlers.onStatus('failed');
    throw lastError instanceof Error ? lastError : new Error('Unable to reach the Bingo server');
  }
  if (version !== connectionVersion || deliberateLeave) {
    await joined.leave(true);
    return;
  }
  room = joined;

  joined.onMessage(BINGO_SERVER_MESSAGES.snapshot, (payload: BingoSnapshotPayload) => {
    if (payload.myCards.length > 0) clearPendingPurchase();
    handlers.onSnapshot(payload);
  });
  joined.onMessage(BINGO_SERVER_MESSAGES.ballCalled, handlers.onBall);
  joined.onMessage(BINGO_SERVER_MESSAGES.winner, handlers.onWinner);
  joined.onMessage(BINGO_SERVER_MESSAGES.claimRejected, handlers.onClaimRejected);
  joined.onMessage(
    BINGO_SERVER_MESSAGES.actionRejected,
    (payload: BingoActionRejectedPayload) => {
      if (
        payload.action === 'purchaseCards' &&
        payload.reason !== 'purchase_in_progress'
      ) {
        clearPendingPurchase();
      }
      handlers.onActionRejected(payload);
    },
  );

  joined.onLeave((code) => {
    if (version !== connectionVersion) return;
    room = null;
    if (deliberateLeave || code === 4001) {
      handlers.onStatus('disconnected');
      return;
    }

    handlers.onStatus('connecting');
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      if (deliberateLeave || version !== connectionVersion) return;
      void connectToBingo(accessToken, roomCode, handlers).catch(() => {
        if (!deliberateLeave) handlers.onStatus('failed');
      });
    }, 750);
  });

  handlers.onStatus('connected');
  flushQueuedMessages(joined);
}

export function purchaseBingoCards(
  quantity: number,
  markingMode: BingoMarkingMode,
): void {
  if (pendingPurchase) return;
  pendingPurchase = {
    payload: {
      quantity,
      markingMode,
      requestId: requestId('purchase'),
    },
    attempts: 1,
    timer: null,
  };
  sendBingoMessage(BINGO_CLIENT_MESSAGES.purchaseCards, pendingPurchase.payload);
  schedulePurchaseRetry();
}

export function setBingoReady(ready: boolean): void {
  sendBingoMessage(BINGO_CLIENT_MESSAGES.setReady, { ready });
}

export function updateBingoConfig(
  config: Pick<
    RoomBingoConfig,
    'startMode' | 'countdownSeconds' | 'numberCallInterval' | 'npcCount' | 'tier' | 'chaosLevel'
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

export function markBingoCell(
  round: number,
  cardIndex: number,
  cellIndex: number,
  marked: boolean,
): void {
  sendBingoMessage(BINGO_CLIENT_MESSAGES.markCell, {
    round,
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
    tier,
    cardIndex,
    requestId: requestId('claim'),
  });
}

export async function leaveBingo(): Promise<void> {
  deliberateLeave = true;
  connectionVersion += 1;
  queuedMessages.length = 0;
  clearPendingPurchase();
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const activeRoom = room;
  room = null;
  await activeRoom?.leave(true);
}
