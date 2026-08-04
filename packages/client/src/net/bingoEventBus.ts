import type { ActiveBingoEvent, BingoSnapshotPayload } from '@bingo/shared';

export interface BingoEventViewState {
  activeEvent: ActiveBingoEvent | null;
  eventHistory: ActiveBingoEvent[];
  phase: BingoSnapshotPayload['phase'];
  nextDrawAt: number | null;
}

type Listener = (state: BingoEventViewState) => void;

let current: BingoEventViewState = {
  activeEvent: null,
  eventHistory: [],
  phase: 'WAITING',
  nextDrawAt: null,
};

const listeners = new Set<Listener>();

export function publishBingoEventSnapshot(snapshot: BingoSnapshotPayload): void {
  current = {
    activeEvent: snapshot.activeEvent ?? null,
    eventHistory: snapshot.eventHistory ?? [],
    phase: snapshot.phase,
    nextDrawAt: snapshot.nextDrawAt,
  };
  for (const listener of listeners) listener(current);
}

export function subscribeBingoEvents(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

export function clearBingoEventSnapshot(): void {
  current = {
    activeEvent: null,
    eventHistory: [],
    phase: 'WAITING',
    nextDrawAt: null,
  };
  for (const listener of listeners) listener(current);
}
