/**
 * Translates the server-authoritative room state into stage directions.
 *
 * The server decides *what* happens — which event fired, when it ends, which
 * phase the round is in. This module only decides how the hall should look and
 * how the crowd should behave while it happens, so the same snapshot always
 * produces the same show on every client.
 */

import type { ActiveBingoEvent, BingoPhase } from '@bingo/shared';
import type { CharacterAnimationState, CharacterPersonality } from '../ProceduralCharacter';

export interface HallMood {
  /** Multiplier applied to the hall's ambient and key lights. */
  readonly lightScale: number;
  /** Colour the room's fill light is tinted towards. */
  readonly tint: string;
  /** Extra fog for events that should feel enclosed. */
  readonly fogBoost: number;
  readonly emergencyLights: boolean;
  readonly confetti: boolean;
  readonly greenWash: boolean;
  /** 0 = steady stage spots, 1 = full party sweep. */
  readonly spotlightEnergy: number;
  readonly hostState: CharacterAnimationState;
  /** Short Italian caption shown on the stage screen. */
  readonly caption: string | null;
  /** Fraction of the crowd that reacts to this beat, 0..1. */
  readonly crowdReactivity: number;
}

const CALM: HallMood = {
  lightScale: 1,
  tint: '#ffd9ae',
  fogBoost: 0,
  emergencyLights: false,
  confetti: false,
  greenWash: false,
  spotlightEnergy: 0.15,
  hostState: 'IDLE',
  caption: null,
  crowdReactivity: 0.25,
};

export function moodFor(
  phase: BingoPhase,
  activeEvent: ActiveBingoEvent | null,
  celebrating: boolean,
): HallMood {
  if (activeEvent) {
    switch (activeEvent.id) {
      case 'blackout':
        return {
          ...CALM,
          lightScale: 0.16,
          tint: '#5b6cff',
          fogBoost: 0.55,
          emergencyLights: true,
          spotlightEnergy: 0,
          hostState: 'TALK',
          caption: 'BLACKOUT',
          crowdReactivity: 0.9,
        };
      case 'broken-microphone':
        return {
          ...CALM,
          lightScale: 0.92,
          hostState: 'ARGUE',
          caption: 'MICROFONO GUASTO',
          crowdReactivity: 0.6,
        };
      case 'false-bingo':
        return {
          ...CALM,
          lightScale: 1.04,
          spotlightEnergy: 0.5,
          hostState: 'ARGUE',
          caption: 'CONTROLLO CARTELLA',
          crowdReactivity: 0.85,
        };
      case 'confetti':
        return {
          ...CALM,
          lightScale: 1.12,
          tint: '#ffd166',
          confetti: true,
          spotlightEnergy: 1,
          hostState: 'CELEBRATE',
          caption: 'CORIANDOLI!',
          crowdReactivity: 1,
        };
      case 'zombie-outbreak':
        return {
          ...CALM,
          lightScale: 0.6,
          tint: '#8dff9f',
          fogBoost: 0.35,
          greenWash: true,
          spotlightEnergy: 0.7,
          hostState: 'SCARED',
          caption: 'ZOMBIE PARTY',
          crowdReactivity: 1,
        };
      case 'distracted-waiter':
      default:
        return {
          ...CALM,
          hostState: 'LOOK_AT_STAGE',
          caption: 'UN ATTIMO…',
          crowdReactivity: 0.55,
        };
    }
  }

  if (celebrating || phase === 'RESULTS') {
    return {
      ...CALM,
      lightScale: 1.15,
      tint: '#ffcf7a',
      confetti: celebrating,
      spotlightEnergy: 0.95,
      hostState: 'CELEBRATE',
      caption: phase === 'RESULTS' ? 'PREMIAZIONE' : null,
      crowdReactivity: 1,
    };
  }

  if (phase === 'COUNTDOWN') {
    return {
      ...CALM,
      lightScale: 0.72,
      spotlightEnergy: 0.65,
      hostState: 'TALK',
      caption: 'SI PARTE',
      crowdReactivity: 0.45,
    };
  }

  if (phase === 'PLAYING') {
    return { ...CALM, spotlightEnergy: 0.3, hostState: 'TALK', crowdReactivity: 0.4 };
  }

  return CALM;
}

const REACTIVE_STATES: readonly CharacterAnimationState[] = [
  'LOOK_AT_CARD',
  'MARK_NUMBER',
  'LOOK_AT_STAGE',
  'TALK',
  'LAUGH',
  'DISAPPOINTED',
];

/**
 * Picks what a single seated guest is doing this beat.
 *
 * `seed` must be stable per character and `beat` changes when the room does
 * something worth reacting to (a new ball, an event, a win). Together they give
 * a crowd that moves as a group without every body doing the same thing.
 */
export function crowdAnimation(
  seed: number,
  beat: number,
  mood: HallMood,
  activeEvent: ActiveBingoEvent | null,
  personality: CharacterPersonality,
  celebrating: boolean,
): CharacterAnimationState {
  if (activeEvent?.id === 'zombie-outbreak') {
    return seed % 3 === 0 ? 'ZOMBIE_FEED' : 'ZOMBIE_IDLE';
  }
  if (activeEvent?.id === 'blackout') {
    return seed % 4 === 0 ? 'SCARED' : seed % 4 === 1 ? 'TALK' : 'LOOK_AT_STAGE';
  }
  if (activeEvent?.id === 'false-bingo') {
    if (seed % 7 === 0) return 'STAND_UP';
    return seed % 3 === 0 ? 'ARGUE' : 'LOOK_AT_STAGE';
  }
  if (mood.confetti || celebrating) {
    return seed % 5 === 0 ? 'LAUGH' : 'CELEBRATE';
  }
  if (activeEvent) {
    return seed % 2 === 0 ? 'TALK' : 'LOOK_AT_STAGE';
  }

  // Personality decides how eagerly a guest reacts at all; quiet types spend
  // most of the round watching their card.
  const eagerness = PERSONALITY_REACTIVITY[personality];
  const roll = (seed + beat * 7) % 100;
  if (roll > mood.crowdReactivity * eagerness * 100) {
    return seed % 3 === 0 ? 'LOOK_AT_STAGE' : 'SEATED_IDLE';
  }
  return REACTIVE_STATES[(seed + beat) % REACTIVE_STATES.length] ?? 'SEATED_IDLE';
}

const PERSONALITY_REACTIVITY: Record<CharacterPersonality, number> = {
  CALM: 0.55,
  NERVOUS: 1.3,
  LOUD: 1.25,
  LUCKY: 0.95,
  GRUMPY: 0.5,
  DISTRACTED: 0.75,
  PRANKSTER: 1.15,
};
