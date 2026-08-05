import { describe, expect, it } from 'vitest';
import { EMOTES, EMOTE_LABELS, type Emote } from '@bingo/shared';
import { animationFor } from '../Crowd';
import type { RemotePlayer } from '../../net/hubConnection';

/**
 * Every button in the emote bar has to do its own thing.
 *
 * Three of them used to collapse onto CELEBRATE and "saluta" played the
 * talking gesture, so the bar offered six labels and performed three
 * animations. Nothing in the type system noticed, because every branch
 * returned a valid state — it was just the wrong one.
 */

function playerWith(emote: Emote | ''): RemotePlayer {
  return {
    userId: 'u',
    displayName: 'Test',
    level: 1,
    x: 0,
    y: 0,
    z: 0,
    rotY: 0,
    moving: false,
    running: false,
    emote,
    lastSeq: 0,
    connected: true,
    bodyType: 'neutral',
    skinTone: '#c68642',
    hairStyle: 'short',
    hairColor: '#000000',
    shirtColor: '#000000',
    pantsColor: '#000000',
    heightCm: 175,
  };
}

describe('emote animations', () => {
  it('gives every emote its own animation', () => {
    const states = EMOTES.map((emote) => animationFor(playerWith(emote), false));
    expect(new Set(states).size).toBe(EMOTES.length);
  });

  it('plays the animation the label promises', () => {
    const expected: Record<Emote, string> = {
      wave: 'WAVE',
      clap: 'APPLAUD',
      dance: 'DANCE',
      cheer: 'CELEBRATE',
      sit: 'SEATED_IDLE',
      laugh: 'LAUGH',
    };
    for (const emote of EMOTES) {
      expect(animationFor(playerWith(emote), false), EMOTE_LABELS[emote]).toBe(expected[emote]);
    }
  });

  it('falls back to locomotion when no emote is playing', () => {
    expect(animationFor(playerWith(''), false)).toBe('IDLE');
    expect(animationFor({ ...playerWith(''), moving: true }, false)).toBe('WALK');
    expect(animationFor({ ...playerWith(''), moving: true, running: true }, false)).toBe('RUN');
  });

  it('lets an emote override walking, so a wave is visible while moving', () => {
    expect(animationFor({ ...playerWith('wave'), moving: true }, false)).toBe('WAVE');
  });
});
