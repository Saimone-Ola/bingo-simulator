import type { BingoPhase } from '@bingo/shared';

const ALLOWED_TRANSITIONS: Readonly<Record<BingoPhase, readonly BingoPhase[]>> = {
  WAITING: ['CARD_PURCHASE'],
  CARD_PURCHASE: ['COUNTDOWN', 'PLAYING', 'ENDED'],
  COUNTDOWN: ['CARD_PURCHASE', 'PLAYING', 'ENDED'],
  PLAYING: ['EVENT_ACTIVE', 'RESULTS', 'ENDED'],
  EVENT_ACTIVE: ['PLAYING', 'RESULTS', 'ENDED'],
  RESULTS: ['ENDED'],
  ENDED: ['CARD_PURCHASE'],
};

export class LobbyStateMachine {
  private currentPhase: BingoPhase;
  private changedAtMs: number;

  constructor(initial: BingoPhase = 'WAITING', now = Date.now()) {
    this.currentPhase = initial;
    this.changedAtMs = now;
  }

  get phase(): BingoPhase {
    return this.currentPhase;
  }

  get changedAt(): number {
    return this.changedAtMs;
  }

  canTransition(next: BingoPhase): boolean {
    return ALLOWED_TRANSITIONS[this.currentPhase].includes(next);
  }

  transition(next: BingoPhase, now = Date.now()): void {
    if (next === this.currentPhase) return;
    if (!this.canTransition(next)) {
      throw new Error(`Invalid Bingo phase transition: ${this.currentPhase} -> ${next}`);
    }
    this.currentPhase = next;
    this.changedAtMs = now;
  }
}
