import { describe, expect, it } from 'vitest';
import {
  BingoEventDirector,
  effectiveBingoCallInterval,
  type ActiveBingoEvent,
} from '@bingo/shared';
import { LobbyStateMachine } from './lobbyStateMachine';

describe('synchronized Bingo event lifecycle', () => {
  it('moves from playing to event and back without changing the base interval', () => {
    const phases = new LobbyStateMachine('PLAYING', 1_000);
    const baseInterval = 5_000;
    const event: ActiveBingoEvent = {
      id: 'blackout',
      name: 'Blackout controllato',
      description: 'Luci di emergenza attive.',
      category: 'TECHNICAL',
      startedAt: 2_000,
      endsAt: 12_000,
      callIntervalMultiplier: 1.7,
      visualIntensity: 2,
    };

    phases.transition('EVENT_ACTIVE', event.startedAt);
    expect(phases.phase).toBe('EVENT_ACTIVE');
    expect(effectiveBingoCallInterval(baseInterval, event)).toBe(8_500);
    expect(baseInterval).toBe(5_000);

    phases.transition('PLAYING', event.endsAt);
    expect(phases.phase).toBe('PLAYING');
    expect(effectiveBingoCallInterval(baseInterval, null)).toBe(5_000);
  });

  it('keeps event randomness independent and reproducible across reconnect snapshots', () => {
    const left = new BingoEventDirector('round-7-seed');
    const right = new BingoEventDirector('round-7-seed');
    const input = {
      now: 300_000,
      drawIndex: 30,
      chaosLevel: 'ABSURD' as const,
      enabledEvents: ['blackout', 'zombie-outbreak'],
    };

    expect(left.maybeStart(input)).toEqual(right.maybeStart(input));
    expect(left.snapshot()).toEqual(right.snapshot());
  });

  it('records completion before another event can be selected', () => {
    const director = new BingoEventDirector('cooldown-seed');
    let active: ActiveBingoEvent | null = null;

    for (let attempt = 0; attempt < 40 && !active; attempt += 1) {
      active = director.maybeStart({
        now: 240_000 + attempt * 30_000,
        drawIndex: 25,
        chaosLevel: 'CHAOTIC',
      });
    }

    if (!active) return;
    director.finish(active, active.endsAt);
    const snapshot = director.snapshot();
    expect(snapshot.lastEndedAt[active.id]).toBe(active.endsAt);
    expect(snapshot.lastGlobalEventEndedAt).toBe(active.endsAt);

    expect(
      director.maybeStart({
        now: active.endsAt + 1_000,
        drawIndex: 26,
        chaosLevel: 'CHAOTIC',
      }),
    ).toBeNull();
  });
});
