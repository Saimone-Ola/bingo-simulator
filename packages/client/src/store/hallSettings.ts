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

export function readSettings(value: unknown, mobile = false, reducedMotion = false): HallSettings {
  const defaults: HallSettings = { ...DEFAULTS, ...(mobile ? { quality: 'LOW', ...QUALITY_PRESETS.LOW, headBob: false } : {}), reducedMotion };
  if (!value || typeof value !== 'object') return defaults;
  const parsed = value as Partial<HallSettings>;
  const quality = parsed.quality && ['LOW', 'MEDIUM', 'HIGH'].includes(parsed.quality) ? parsed.quality : defaults.quality;
  const boolean = (key: 'shadows' | 'reducedMotion' | 'headBob' | 'muted', fallback: boolean) =>
    typeof parsed[key] === 'boolean' ? parsed[key] : fallback;
  return {
    quality,
    shadows: boolean('shadows', QUALITY_PRESETS[quality].shadows),
    ambientGuests: typeof parsed.ambientGuests === 'number' && Number.isFinite(parsed.ambientGuests) ? clampGuests(parsed.ambientGuests) : QUALITY_PRESETS[quality].ambientGuests,
    reducedMotion: boolean('reducedMotion', defaults.reducedMotion),
    headBob: boolean('headBob', defaults.headBob),
    muted: boolean('muted', defaults.muted),
    volume: typeof parsed.volume === 'number' && Number.isFinite(parsed.volume) ? clampVolume(parsed.volume) : defaults.volume,
  };
}

function readStored(): HallSettings {
  if (typeof window === 'undefined') return readSettings(null);
  const mobile = window.matchMedia?.('(pointer: coarse), (max-width: 767px)').matches ?? false;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  try {
    return readSettings(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'), mobile, reducedMotion);
  } catch {
    return readSettings(null, mobile, reducedMotion);
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
