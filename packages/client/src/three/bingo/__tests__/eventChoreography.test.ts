import { describe, expect, it } from 'vitest';
import { BINGO_EVENT_CATALOG, type ActiveBingoEvent, type BingoEventId } from '@bingo/shared';
import { crowdAnimation, moodFor } from '../eventChoreography';

function activeEvent(id: BingoEventId): ActiveBingoEvent {
  const definition = BINGO_EVENT_CATALOG.find((entry) => entry.id === id);
  if (!definition) throw new Error(`Unknown event ${id}`);
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    startedAt: 0,
    endsAt: definition.durationSeconds * 1_000,
    callIntervalMultiplier: definition.callIntervalMultiplier,
    visualIntensity: definition.visualIntensity,
  };
}

describe('moodFor', () => {
  it('gives every catalogued event a distinct look', () => {
    for (const definition of BINGO_EVENT_CATALOG) {
      const mood = moodFor('EVENT_ACTIVE', activeEvent(definition.id), false);
      expect(mood.caption).not.toBeNull();
    }
  });

  it('drops the house lights and turns on the emergency strips in a blackout', () => {
    const mood = moodFor('EVENT_ACTIVE', activeEvent('blackout'), false);
    expect(mood.lightScale).toBeLessThan(0.3);
    expect(mood.emergencyLights).toBe(true);
    expect(mood.spotlightEnergy).toBe(0);
  });

  it('never blacks the room out completely', () => {
    for (const definition of BINGO_EVENT_CATALOG) {
      expect(moodFor('EVENT_ACTIVE', activeEvent(definition.id), false).lightScale).toBeGreaterThan(0);
    }
  });

  it('throws confetti and a party sweep during the confetti event', () => {
    const mood = moodFor('EVENT_ACTIVE', activeEvent('confetti'), false);
    expect(mood.confetti).toBe(true);
    expect(mood.spotlightEnergy).toBe(1);
  });

  it('washes the hall green for the zombie event without going dark', () => {
    const mood = moodFor('EVENT_ACTIVE', activeEvent('zombie-outbreak'), false);
    expect(mood.greenWash).toBe(true);
    expect(mood.lightScale).toBeGreaterThan(0.3);
  });

  it('puts the presenter on the microphone when it breaks', () => {
    expect(moodFor('EVENT_ACTIVE', activeEvent('broken-microphone'), false).hostState).toBe('ARGUE');
  });

  it('celebrates a win over a quiet playing phase', () => {
    const calm = moodFor('PLAYING', null, false);
    const winning = moodFor('PLAYING', null, true);
    expect(winning.confetti).toBe(true);
    expect(winning.spotlightEnergy).toBeGreaterThan(calm.spotlightEnergy);
  });

  it('dims the room for the countdown so the stage takes over', () => {
    const countdown = moodFor('COUNTDOWN', null, false);
    expect(countdown.lightScale).toBeLessThan(moodFor('CARD_PURCHASE', null, false).lightScale);
    expect(countdown.caption).toBe('SI PARTE');
  });

  it('lets an active event override the phase', () => {
    const mood = moodFor('PLAYING', activeEvent('blackout'), false);
    expect(mood.emergencyLights).toBe(true);
  });
});

describe('crowdAnimation', () => {
  it('is deterministic for the same guest and beat', () => {
    const mood = moodFor('PLAYING', null, false);
    const first = crowdAnimation(42, 7, mood, null, 'CALM', false);
    const second = crowdAnimation(42, 7, mood, null, 'CALM', false);
    expect(first).toBe(second);
  });

  it('turns the whole crowd into comic zombies during the outbreak', () => {
    const event = activeEvent('zombie-outbreak');
    const mood = moodFor('EVENT_ACTIVE', event, false);
    for (let seed = 0; seed < 30; seed += 1) {
      expect(crowdAnimation(seed, 1, mood, event, 'CALM', false)).toMatch(/^ZOMBIE_/);
    }
  });

  it('gets someone out of their chair during a false Bingo', () => {
    const event = activeEvent('false-bingo');
    const mood = moodFor('EVENT_ACTIVE', event, false);
    const states = Array.from({ length: 30 }, (_value, seed) =>
      crowdAnimation(seed, 1, mood, event, 'LOUD', false),
    );
    expect(states).toContain('STAND_UP');
  });

  it('celebrates when a prize is awarded', () => {
    const mood = moodFor('RESULTS', null, true);
    const states = new Set(
      Array.from({ length: 20 }, (_value, seed) => crowdAnimation(seed, 3, mood, null, 'CALM', true)),
    );
    expect([...states].every((state) => state === 'CELEBRATE' || state === 'LAUGH')).toBe(true);
  });

  it('lets quiet personalities react less than loud ones', () => {
    const mood = moodFor('PLAYING', null, false);
    const count = (personality: 'GRUMPY' | 'NERVOUS') =>
      Array.from({ length: 200 }, (_value, seed) =>
        crowdAnimation(seed, 0, mood, null, personality, false),
      ).filter((state) => state !== 'SEATED_IDLE' && state !== 'LOOK_AT_STAGE').length;
    expect(count('NERVOUS')).toBeGreaterThan(count('GRUMPY'));
  });

  it('keeps everyone seated and calm before the round starts', () => {
    const mood = moodFor('WAITING', null, false);
    const states = new Set(
      Array.from({ length: 40 }, (_value, seed) =>
        crowdAnimation(seed, 0, mood, null, 'CALM', false),
      ),
    );
    expect(states.has('CELEBRATE')).toBe(false);
  });
});
