/**
 * Procedural audio for the Bingo hall.
 *
 * Everything is synthesised with the Web Audio API: no asset downloads, no
 * licensing questions for a thesis demo, and a hall that still sounds alive.
 * The whole module is a no-op when the browser refuses an AudioContext, so
 * gameplay never depends on audio succeeding.
 */

export type HallSfx =
  | 'marker'
  | 'ballDrop'
  | 'chair'
  | 'footstep'
  | 'applause'
  | 'confetti'
  | 'micFeedback'
  | 'cinquina'
  | 'bingo'
  | 'purchase'
  | 'error';

interface Voice {
  readonly stop: () => void;
}

let context: AudioContext | null = null;
let master: GainNode | null = null;
let ambience: Voice | null = null;
let unavailable = false;
let currentVolume = 0.6;
let currentMuted = false;

function ensureContext(): AudioContext | null {
  if (unavailable) return null;
  if (context) return context;
  try {
    const Ctor: typeof AudioContext | undefined =
      typeof window === 'undefined'
        ? undefined
        : window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      unavailable = true;
      return null;
    }
    context = new Ctor();
    master = context.createGain();
    master.gain.value = currentMuted ? 0 : currentVolume;
    master.connect(context.destination);
    return context;
  } catch {
    unavailable = true;
    return null;
  }
}

/** Browsers only allow audio after a gesture; call this from a click handler. */
export function resumeHallAudio(): void {
  const ctx = ensureContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}

export function setHallVolume(volume: number, muted: boolean): void {
  currentVolume = Math.max(0, Math.min(1, volume));
  currentMuted = muted;
  if (!master || !context) return;
  const target = muted ? 0 : currentVolume;
  master.gain.setTargetAtTime(target, context.currentTime, 0.08);
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  return buffer;
}

function tone(
  ctx: AudioContext,
  destination: AudioNode,
  options: {
    type: OscillatorType;
    from: number;
    to: number;
    duration: number;
    gain: number;
    delay?: number;
  },
): void {
  const start = ctx.currentTime + (options.delay ?? 0);
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = options.type;
  oscillator.frequency.setValueAtTime(options.from, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(20, options.to),
    start + options.duration,
  );
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, options.gain), start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + options.duration + 0.02);
}

function burst(
  ctx: AudioContext,
  destination: AudioNode,
  options: { duration: number; gain: number; frequency: number; q?: number; delay?: number },
): void {
  const start = ctx.currentTime + (options.delay ?? 0);
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, options.duration);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = options.frequency;
  filter.Q.value = options.q ?? 1;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(options.gain, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start(start);
  source.stop(start + options.duration + 0.02);
}

/**
 * Low murmur of a busy hall: filtered noise plus a slow wobble.
 *
 * `intensity` follows the crowd — a full room during the draw is louder than an
 * empty lobby — but stays well under the sound effects so nothing masks a call.
 */
export function startHallAmbience(): void {
  const ctx = ensureContext();
  if (!ctx || !master || ambience) return;

  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, 4);
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 420;
  filter.Q.value = 0.7;

  const gain = ctx.createGain();
  gain.gain.value = 0.018;

  const wobble = ctx.createOscillator();
  const wobbleGain = ctx.createGain();
  wobble.frequency.value = 0.13;
  wobbleGain.gain.value = 0.009;
  wobble.connect(wobbleGain);
  wobbleGain.connect(gain.gain);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start();
  wobble.start();

  ambience = {
    stop: () => {
      try {
        source.stop();
        wobble.stop();
      } catch {
        // Already stopped; nothing to clean up.
      }
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      wobble.disconnect();
      wobbleGain.disconnect();
    },
  };
}

export function stopHallAmbience(): void {
  ambience?.stop();
  ambience = null;
}

let lastPlayedAt = new Map<HallSfx, number>();

/** Minimum gap between two identical effects, so the hall never machine-guns. */
const THROTTLE_MS: Partial<Record<HallSfx, number>> = {
  footstep: 260,
  marker: 70,
  chair: 300,
};

export function playHallSfx(effect: HallSfx): void {
  const ctx = ensureContext();
  const out = master;
  if (!ctx || !out || currentMuted) return;
  const throttle = THROTTLE_MS[effect];
  if (throttle !== undefined) {
    const previous = lastPlayedAt.get(effect) ?? 0;
    const now = performance.now();
    if (now - previous < throttle) return;
    lastPlayedAt.set(effect, now);
  }

  switch (effect) {
    case 'marker':
      burst(ctx, out, { duration: 0.09, gain: 0.16, frequency: 1800, q: 0.9 });
      tone(ctx, out, { type: 'triangle', from: 180, to: 96, duration: 0.07, gain: 0.05 });
      break;
    case 'ballDrop':
      tone(ctx, out, { type: 'sine', from: 720, to: 320, duration: 0.16, gain: 0.09 });
      burst(ctx, out, { duration: 0.12, gain: 0.1, frequency: 2600, q: 2.4, delay: 0.05 });
      break;
    case 'chair':
      burst(ctx, out, { duration: 0.3, gain: 0.09, frequency: 260, q: 0.8 });
      break;
    case 'footstep':
      burst(ctx, out, { duration: 0.08, gain: 0.05, frequency: 190, q: 1.2 });
      break;
    case 'applause':
      for (let index = 0; index < 9; index += 1) {
        burst(ctx, out, {
          duration: 0.34,
          gain: 0.05,
          frequency: 1400 + index * 220,
          q: 0.6,
          delay: index * 0.045,
        });
      }
      break;
    case 'confetti':
      for (let index = 0; index < 5; index += 1) {
        tone(ctx, out, {
          type: 'square',
          from: 520 + index * 180,
          to: 1400 + index * 180,
          duration: 0.12,
          gain: 0.035,
          delay: index * 0.06,
        });
      }
      break;
    case 'micFeedback':
      tone(ctx, out, { type: 'sawtooth', from: 1900, to: 2600, duration: 0.42, gain: 0.05 });
      break;
    case 'cinquina':
      tone(ctx, out, { type: 'triangle', from: 520, to: 780, duration: 0.2, gain: 0.09 });
      tone(ctx, out, { type: 'triangle', from: 780, to: 1040, duration: 0.24, gain: 0.08, delay: 0.16 });
      break;
    case 'bingo':
      [523, 659, 784, 1046].forEach((frequency, index) => {
        tone(ctx, out, {
          type: 'triangle',
          from: frequency,
          to: frequency * 1.02,
          duration: 0.3,
          gain: 0.085,
          delay: index * 0.11,
        });
      });
      break;
    case 'purchase':
      tone(ctx, out, { type: 'sine', from: 880, to: 1320, duration: 0.13, gain: 0.07 });
      break;
    case 'error':
      tone(ctx, out, { type: 'square', from: 220, to: 130, duration: 0.2, gain: 0.05 });
      break;
    default:
      break;
  }
}

/** Releases every audio resource; call when the hall unmounts. */
export function disposeHallAudio(): void {
  stopHallAmbience();
  lastPlayedAt = new Map();
  const ctx = context;
  master?.disconnect();
  master = null;
  context = null;
  void ctx?.close().catch(() => undefined);
}
