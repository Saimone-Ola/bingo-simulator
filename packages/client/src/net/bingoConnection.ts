import { Client, type Room } from '@colyseus/sdk';
import {
  BINGO_CLIENT_MESSAGES,
  BINGO_SERVER_MESSAGES,
  ROOM_NAMES,
  normaliseBingoRoomCode,
  type BingoBallCalledPayload,
  type BingoClaimRejectedPayload,
  type BingoPlayerSummary,
  type BingoRoundResetPayload,
  type BingoSnapshotPayload,
  type BingoWinnerPayload,
} from '@bingo/shared';
import { wsOrigin } from '../lib/apiOrigin';

export type BingoConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface BingoHandlers {
  onStatus: (status: BingoConnectionStatus) => void;
  onSnapshot: (payload: BingoSnapshotPayload) => void;
  onBall: (payload: BingoBallCalledPayload) => void;
  onPlayers: (players: BingoPlayerSummary[]) => void;
  onWinner: (payload: BingoWinnerPayload) => void;
  onClaimRejected: (payload: BingoClaimRejectedPayload) => void;
  onRoundReset: (payload: BingoRoundResetPayload) => void;
}

function endpoint(): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  return configured ? configured.replace(/\/$/, '') : wsOrigin();
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
  joined.onMessage(BINGO_SERVER_MESSAGES.playersChanged, handlers.onPlayers);
  joined.onMessage(BINGO_SERVER_MESSAGES.winner, handlers.onWinner);
  joined.onMessage(BINGO_SERVER_MESSAGES.claimRejected, handlers.onClaimRejected);
  joined.onMessage(BINGO_SERVER_MESSAGES.roundReset, handlers.onRoundReset);

  joined.onLeave((code) => {
    room = null;
    if (deliberateLeave || code === 4001) {
      handlers.onStatus('disconnected');
      return;
    }
    handlers.onStatus('failed');
  });

  handlers.onStatus('connected');
}

export function claimBingo(round: number): void {
  room?.send(BINGO_CLIENT_MESSAGES.claim, { round });
}

export async function leaveBingo(): Promise<void> {
  deliberateLeave = true;
  await room?.leave(true);
  room = null;
}
