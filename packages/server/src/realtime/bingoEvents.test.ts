import { describe, expect, it } from 'vitest';
import {
  BingoEventDirector,
  BINGO_EVENT_CATALOG,
  effectiveBingoCallInterval,
  isBingoEventAllowed,
  type ActiveBingoEvent,
} from '@bingo/shared';

describe('BingoEventDirector', () => {
  it('keeps classic mode free from random events', () => {
    const director = new BingoEventDirector('classic-seed');
    const event = director.maybeStart({
      now: 120_000,
      drawIndex: 40,
      chaosLevel: 'CLASSIC',
    });
    expect(event).toBeNull();
  });

  it('is deterministic for the same seed and inputs', () => {
    const left = new BingoEventDirector('thesis-seed');
    const right = new BingoEventDirector('thesis-seed');

    const input = {
      now: 240_000,
      drawIndex: 20,
      chaosLevel: 'ABSURD' as const,
    };

    expect(left.maybeStart(input)).toEqual(right.maybeStart(input));
  });

  it('never enables an event below its required chaos level', () => {
    const zombie = BINGO_EVENT_CATALOG.find((event) => event.id === 'zombie-outbreak');
    expect(zombie).toBeDefined();
    expect(isBingoEventAllowed(zombie!, 'LIGHT')).toBe(false);
    expect(isBingoEventAllowed(zombie!, 'CHAOTIC')).toBe(false);
    expect(isBingoEventAllowed(zombie!, 'ABSURD')).toBe(true);
  });

  it('changes only the temporary call interval', () => {
    const event: ActiveBingoEvent = {
      id: 'blackout',
      name: 'Blackout controllato',
      description: 'test',
      category: 'TECHNICAL',
      startedAt: 0,
      endsAt: 10_000,
      callIntervalMultiplier: 1.7,
      visualIntensity: 2,
    };

    expect(effectiveBingoCallInterval(5_000, null)).toBe(5_000);
    expect(effectiveBingoCallInterval(5_000, event)).toBe(8_500);
  });

  it('respects explicit event allowlists', () => {
    const director = new BingoEventDirector('allowlist-seed');
    let selected: string | null = null;

    for (let attempt = 0; attempt < 30 && !selected; attempt += 1) {
      const event = director.maybeStart({
        now: 300_000 + attempt * 60_000,
        drawIndex: 30,
        chaosLevel: 'ABSURD',
        enabledEvents: ['broken-microphone'],
      });
      if (event) selected = event.id;
    }

    expect(selected === null || selected === 'broken-microphone').toBe(true);
  });
});
