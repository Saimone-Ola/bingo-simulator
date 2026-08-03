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

export async function connectToBingo(
  accessToken: string,
  requestedCode: string,
  handlers: BingoHandlers,
): Promise<void> {
  deliberateLeave = false;
  handlers.onStatus('connecting');

  const client = new Client(endpoint());
  const joined = await client.joinOrCreate(ROOM_NAMES.bingo, {
    accessToken,
    roomCode: normaliseBingoRoomCode(requestedCode),
  });
  room = joined;

  joined.onMessage(BINGO_SERVER_MESSAGES.snapshot, handlers.onSnapshot);
  joined.onMessage(BINGO_SERVER_MESSAGES.ballCalled, handlers.onBall);
  joined.onMessage(BINGO_SERVER_MESSAGES.winner, handlers.onWinner);
  joined.onMessage(BINGO_SERVER_MESSAGES.claimRejected, handlers.onClaimRejected);
  joined.onMessage(BINGO_SERVER_MESSAGES.actionRejected, handlers.onActionRejected);

  joined.onLeave((code) => {
    room = null;
    handlers.onStatus(deliberateLeave || code === 4001 ? 'disconnected' : 'failed');
  });

  handlers.onStatus('connected');
}

export function purchaseBingoCards(
  quantity: number,
  markingMode: BingoMarkingMode,
): void {
  room?.send(BINGO_CLIENT_MESSAGES.purchaseCards, {
    quantity,
    markingMode,
    requestId: requestId('purchase'),
  });
}

export function setBingoReady(ready: boolean): void {
  room?.send(BINGO_CLIENT_MESSAGES.setReady, { ready });
}

export function updateBingoConfig(
  config: Pick<
    RoomBingoConfig,
    'startMode' | 'countdownSeconds' | 'numberCallInterval' | 'npcCount' | 'tier' | 'chaosLevel'
  >,
): void {
  room?.send(BINGO_CLIENT_MESSAGES.updateConfig, config);
}

export function startBingoGame(): void {
  room?.send(BINGO_CLIENT_MESSAGES.startGame, {});
}

export function cancelBingoStart(): void {
  room?.send(BINGO_CLIENT_MESSAGES.cancelStart, {});
}

export function markBingoCell(
  round: number,
  cardIndex: number,
  cellIndex: number,
  marked: boolean,
): void {
  room?.send(BINGO_CLIENT_MESSAGES.markCell, {
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
  room?.send(BINGO_CLIENT_MESSAGES.claim, {
    round,
    tier,
    cardIndex,
    requestId: requestId('claim'),
  });
}

export async function leaveBingo(): Promise<void> {
  deliberateLeave = true;
  await room?.leave(true);
  room = null;
}
