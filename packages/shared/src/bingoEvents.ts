import type { BingoChaosLevel } from './bingo';

export const BINGO_EVENT_IDS = [
  'distracted-waiter',
  'broken-microphone',
  'blackout',
  'false-bingo',
  'confetti',
  'zombie-outbreak',
] as const;

export type BingoEventId = (typeof BINGO_EVENT_IDS)[number];
export type BingoEventCategory = 'AMBIENT' | 'COMEDY' | 'TECHNICAL' | 'MINIGAME';

export interface BingoEventDefinition {
  id: BingoEventId;
  name: string;
  description: string;
  category: BingoEventCategory;
  minChaosLevel: BingoChaosLevel;
  weight: number;
  minDrawIndex: number;
  maxOccurrences: number;
  cooldownSeconds: number;
  durationSeconds: number;
  allowedDuringDraw: boolean;
  callIntervalMultiplier: number;
  visualIntensity: number;
}

export interface ActiveBingoEvent {
  id: BingoEventId;
  name: string;
  description: string;
  category: BingoEventCategory;
  startedAt: number;
  endsAt: number;
  callIntervalMultiplier: number;
  visualIntensity: number;
}

export interface BingoEventDirectorInput {
  now: number;
  drawIndex: number;
  chaosLevel: BingoChaosLevel;
  enabledEvents?: readonly string[];
  activeEvent?: ActiveBingoEvent | null;
}

export interface BingoEventDirectorSnapshot {
  occurrences: Partial<Record<BingoEventId, number>>;
  lastEndedAt: Partial<Record<BingoEventId, number>>;
  lastGlobalEventEndedAt: number;
}

export const BINGO_EVENT_CATALOG: readonly BingoEventDefinition[] = [
  {
    id: 'distracted-waiter',
    name: 'Cameriere distratto',
    description: 'Un cameriere inciampa e la sala reagisce mentre il personale sistema il tavolo.',
    category: 'AMBIENT',
    minChaosLevel: 'LIGHT',
    weight: 26,
    minDrawIndex: 3,
    maxOccurrences: 2,
    cooldownSeconds: 55,
    durationSeconds: 9,
    allowedDuringDraw: true,
    callIntervalMultiplier: 1.15,
    visualIntensity: 1,
  },
  {
    id: 'broken-microphone',
    name: 'Microfono guasto',
    description: 'Il presentatore deve ripetere il numero, che resta comunque leggibile sul tabellone.',
    category: 'TECHNICAL',
    minChaosLevel: 'LIGHT',
    weight: 22,
    minDrawIndex: 4,
    maxOccurrences: 2,
    cooldownSeconds: 65,
    durationSeconds: 8,
    allowedDuringDraw: true,
    callIntervalMultiplier: 1.35,
    visualIntensity: 1,
  },
  {
    id: 'blackout',
    name: 'Blackout controllato',
    description: 'Le luci principali si spengono e restano attive soltanto le luci di emergenza.',
    category: 'TECHNICAL',
    minChaosLevel: 'CHAOTIC',
    weight: 16,
    minDrawIndex: 7,
    maxOccurrences: 1,
    cooldownSeconds: 120,
    durationSeconds: 11,
    allowedDuringDraw: false,
    callIntervalMultiplier: 1.7,
    visualIntensity: 2,
  },
  {
    id: 'false-bingo',
    name: 'Falso Bingo',
    description: 'Un NPC festeggia troppo presto e il controllo della cartella smentisce la vincita.',
    category: 'COMEDY',
    minChaosLevel: 'LIGHT',
    weight: 20,
    minDrawIndex: 8,
    maxOccurrences: 2,
    cooldownSeconds: 80,
    durationSeconds: 10,
    allowedDuringDraw: true,
    callIntervalMultiplier: 1.25,
    visualIntensity: 1,
  },
  {
    id: 'confetti',
    name: 'Coriandoli fuori programma',
    description: 'Il sistema scenico parte per errore e gli NPC reagiscono alla pioggia di coriandoli.',
    category: 'COMEDY',
    minChaosLevel: 'CHAOTIC',
    weight: 14,
    minDrawIndex: 10,
    maxOccurrences: 1,
    cooldownSeconds: 110,
    durationSeconds: 12,
    allowedDuringDraw: true,
    callIntervalMultiplier: 1.2,
    visualIntensity: 2,
  },
  {
    id: 'zombie-outbreak',
    name: 'Epidemia zombie',
    description: 'La sala diventa una scena horror-comica e il ritmo rallenta per un breve minigioco.',
    category: 'MINIGAME',
    minChaosLevel: 'ABSURD',
    weight: 8,
    minDrawIndex: 12,
    maxOccurrences: 1,
    cooldownSeconds: 180,
    durationSeconds: 18,
    allowedDuringDraw: false,
    callIntervalMultiplier: 2.2,
    visualIntensity: 3,
  },
] as const;

const CHAOS_RANK: Record<BingoChaosLevel, number> = {
  CLASSIC: 0,
  LIGHT: 1,
  CHAOTIC: 2,
  ABSURD: 3,
};

const GLOBAL_EVENT_GAP_SECONDS: Record<BingoChaosLevel, number> = {
  CLASSIC: Number.POSITIVE_INFINITY,
  LIGHT: 45,
  CHAOTIC: 28,
  ABSURD: 18,
};

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextRandom(state: number): { state: number; value: number } {
  let next = (state + 0x6d2b79f5) >>> 0;
  let mixed = next;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return { state: next, value: ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296 };
}

export function effectiveBingoCallInterval(
  baseIntervalMs: number,
  activeEvent: ActiveBingoEvent | null | undefined,
): number {
  if (!activeEvent) return baseIntervalMs;
  return Math.round(baseIntervalMs * activeEvent.callIntervalMultiplier);
}

export function isBingoEventAllowed(
  definition: BingoEventDefinition,
  chaosLevel: BingoChaosLevel,
): boolean {
  return CHAOS_RANK[chaosLevel] >= CHAOS_RANK[definition.minChaosLevel];
}

export class BingoEventDirector {
  private randomState: number;
  private occurrences: Partial<Record<BingoEventId, number>> = {};
  private lastEndedAt: Partial<Record<BingoEventId, number>> = {};
  private lastGlobalEventEndedAt = 0;

  constructor(
    seed: string,
    private readonly catalog: readonly BingoEventDefinition[] = BINGO_EVENT_CATALOG,
  ) {
    this.randomState = hashSeed(seed);
  }

  snapshot(): BingoEventDirectorSnapshot {
    return {
      occurrences: { ...this.occurrences },
      lastEndedAt: { ...this.lastEndedAt },
      lastGlobalEventEndedAt: this.lastGlobalEventEndedAt,
    };
  }

  reset(seed: string): void {
    this.randomState = hashSeed(seed);
    this.occurrences = {};
    this.lastEndedAt = {};
    this.lastGlobalEventEndedAt = 0;
  }

  finish(event: ActiveBingoEvent, now: number): void {
    this.lastEndedAt[event.id] = now;
    this.lastGlobalEventEndedAt = now;
  }

  maybeStart(input: BingoEventDirectorInput): ActiveBingoEvent | null {
    if (input.chaosLevel === 'CLASSIC' || input.activeEvent) return null;

    const globalGap = GLOBAL_EVENT_GAP_SECONDS[input.chaosLevel] * 1_000;
    if (input.now - this.lastGlobalEventEndedAt < globalGap) return null;

    const enabled = new Set(input.enabledEvents ?? []);
    const candidates = this.catalog.filter((definition) => {
      const count = this.occurrences[definition.id] ?? 0;
      const lastEnded = this.lastEndedAt[definition.id] ?? 0;
      const explicitlyEnabled = enabled.size === 0 || enabled.has(definition.id);
      return (
        explicitlyEnabled &&
        isBingoEventAllowed(definition, input.chaosLevel) &&
        input.drawIndex >= definition.minDrawIndex &&
        count < definition.maxOccurrences &&
        input.now - lastEnded >= definition.cooldownSeconds * 1_000
      );
    });

    if (candidates.length === 0) return null;

    // An eligibility check does not guarantee an event. This keeps events
    // surprising and lets the chaos setting control density without touching
    // the Bingo draw RNG.
    const gate = this.takeRandom();
    const gateThreshold = input.chaosLevel === 'LIGHT' ? 0.32 : input.chaosLevel === 'CHAOTIC' ? 0.5 : 0.68;
    if (gate > gateThreshold) return null;

    const totalWeight = candidates.reduce((sum, event) => sum + event.weight, 0);
    let cursor = this.takeRandom() * totalWeight;
    let selected = candidates[candidates.length - 1]!;
    for (const candidate of candidates) {
      cursor -= candidate.weight;
      if (cursor <= 0) {
        selected = candidate;
        break;
      }
    }

    this.occurrences[selected.id] = (this.occurrences[selected.id] ?? 0) + 1;
    return {
      id: selected.id,
      name: selected.name,
      description: selected.description,
      category: selected.category,
      startedAt: input.now,
      endsAt: input.now + selected.durationSeconds * 1_000,
      callIntervalMultiplier: selected.callIntervalMultiplier,
      visualIntensity: selected.visualIntensity,
    };
  }

  private takeRandom(): number {
    const result = nextRandom(this.randomState);
    this.randomState = result.state;
    return result.value;
  }
}
