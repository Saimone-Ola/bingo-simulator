import { create } from 'zustand';

/**
 * Player-facing quality and comfort settings for the Bingo hall.
 *
 * Persisted to localStorage so a machine that struggles once keeps its reduced
 * settings on the next visit, and read by the scene through a single selector so
 * changing a slider does not re-render the whole page.
 */

export type HallQuality = 'LOW' | 'MEDIUM' | 'HIGH';

export interface HallSettings {
  quality: HallQuality;
  shadows: boolean;
  /** Extra decorative guests seated around the hall. */
  ambientGuests: number;
  reducedMotion: boolean;
  headBob: boolean;
  muted: boolean;
  volume: number;
}

export interface HallSettingsStore extends HallSettings {
  set: <K extends keyof HallSettings>(key: K, value: HallSettings[K]) => void;
  applyQuality: (quality: HallQuality) => void;
}

const STORAGE_KEY = 'bingo:hall-settings:v1';

const DEFAULTS: HallSettings = {
  quality: 'MEDIUM',
  shadows: true,
  ambientGuests: 10,
  reducedMotion: false,
  headBob: true,
  muted: false,
  volume: 0.6,
};

export const QUALITY_PRESETS: Record<HallQuality, Pick<HallSettings, 'shadows' | 'ambientGuests'>> = {
  LOW: { shadows: false, ambientGuests: 4 },
  MEDIUM: { shadows: true, ambientGuests: 10 },
  HIGH: { shadows: true, ambientGuests: 18 },
};

/** Renderer knobs derived from the quality preset. */
export interface HallRenderProfile {
  readonly dpr: readonly [number, number];
  readonly shadowMapSize: number;
  readonly accentLights: number;
  readonly antialias: boolean;
}

export const RENDER_PROFILES: Record<HallQuality, HallRenderProfile> = {
  LOW: { dpr: [0.7, 1], shadowMapSize: 512, accentLights: 3, antialias: false },
  MEDIUM: { dpr: [1, 1.5], shadowMapSize: 1024, accentLights: 6, antialias: true },
  HIGH: { dpr: [1, 2], shadowMapSize: 2048, accentLights: 9, antialias: true },
};

function readStored(): HallSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<HallSettings>;
    return {
      quality: parsed.quality ?? DEFAULTS.quality,
      shadows: parsed.shadows ?? DEFAULTS.shadows,
      ambientGuests: clampGuests(parsed.ambientGuests ?? DEFAULTS.ambientGuests),
      reducedMotion: parsed.reducedMotion ?? DEFAULTS.reducedMotion,
      headBob: parsed.headBob ?? DEFAULTS.headBob,
      muted: parsed.muted ?? DEFAULTS.muted,
      volume: clampVolume(parsed.volume ?? DEFAULTS.volume),
    };
  } catch {
    // A corrupted or unavailable store must never keep a player out of the hall.
    return DEFAULTS;
  }
}

function clampGuests(value: number): number {
  return Math.max(0, Math.min(24, Math.round(value)));
}

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function persist(settings: HallSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing modes reject writes; the session simply stays unsaved.
  }
}

function snapshot(state: HallSettingsStore): HallSettings {
  return {
    quality: state.quality,
    shadows: state.shadows,
    ambientGuests: state.ambientGuests,
    reducedMotion: state.reducedMotion,
    headBob: state.headBob,
    muted: state.muted,
    volume: state.volume,
  };
}

export const useHallSettings = create<HallSettingsStore>((set, get) => ({
  ...readStored(),
  set: (key, value) => {
    const normalised =
      key === 'ambientGuests'
        ? (clampGuests(value as number) as HallSettings[typeof key])
        : key === 'volume'
          ? (clampVolume(value as number) as HallSettings[typeof key])
          : value;
    set({ [key]: normalised } as Pick<HallSettings, typeof key>);
    persist(snapshot(get()));
  },
  applyQuality: (quality) => {
    set({ quality, ...QUALITY_PRESETS[quality] });
    persist(snapshot(get()));
  },
}));

export function renderProfile(quality: HallQuality): HallRenderProfile {
  return RENDER_PROFILES[quality];
}
