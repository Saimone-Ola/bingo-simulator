import * as THREE from 'three';
import type { ItalianBingoCard } from '@bingo/shared';
import { CARD_COLUMNS, CARD_ROWS } from './cardLayout';

/**
 * Canvas backed textures for everything in the hall that shows text.
 *
 * Drawing a whole Bingo card — grid, numbers and ink marks — into a single
 * texture keeps a six card table at six draw calls instead of a few hundred
 * meshes, which is the difference between a smooth hall and a slideshow on the
 * integrated GPUs this has to run on.
 */

function createCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function finalise(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

export interface LabelOptions {
  readonly color?: string;
  readonly background?: string;
  readonly fontScale?: number;
  readonly bold?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly letterSpacing?: number;
}

const labelCache = new Map<string, THREE.CanvasTexture>();

/**
 * Shared, cached text texture.
 *
 * Signs in the hall repeat a lot ("USCITA", table numbers, the room code), so
 * the cache is keyed by the full draw description and never evicted — the set of
 * distinct strings in a room is small and bounded.
 */
export function labelTexture(text: string, options: LabelOptions = {}): THREE.CanvasTexture | null {
  const width = options.width ?? 1024;
  const height = options.height ?? 256;
  const key = JSON.stringify([text, options, width, height]);
  const cached = labelCache.get(key);
  if (cached) return cached;

  const canvas = createCanvas(width, height);
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return null;

  if (options.background) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, width, height);
  } else {
    context.clearRect(0, 0, width, height);
  }
  context.fillStyle = options.color ?? '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const weight = options.bold === false ? '600' : '800';
  context.font = `${weight} ${Math.round(height * (options.fontScale ?? 0.56))}px Inter, system-ui, sans-serif`;
  if (options.letterSpacing !== undefined && 'letterSpacing' in context) {
    (context as unknown as { letterSpacing: string }).letterSpacing = `${options.letterSpacing}px`;
  }
  context.fillText(text, width / 2, height / 2, width * 0.92);

  const texture = finalise(canvas);
  labelCache.set(key, texture);
  return texture;
}

const CARD_TEXTURE_WIDTH = 576;
const CARD_TEXTURE_HEIGHT = 216;

export interface CardFaceState {
  readonly card: ItalianBingoCard;
  readonly drawn: ReadonlySet<number>;
  readonly markerColor: string;
  readonly title: string;
  readonly active: boolean;
}

export interface CardFaceTexture {
  readonly texture: THREE.CanvasTexture;
  readonly redraw: (state: CardFaceState) => void;
  readonly dispose: () => void;
}

/**
 * Creates a repaintable card face.
 *
 * The texture object is stable for the lifetime of the card so React never has
 * to swap a material; only the pixels change when a number is marked.
 */
export function createCardFaceTexture(): CardFaceTexture | null {
  const canvas = createCanvas(CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT);
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return null;
  const texture = finalise(canvas);

  const redraw = (state: CardFaceState): void => {
    const { width, height } = canvas;
    const marginX = width * 0.028;
    const marginTop = height * 0.15;
    const marginBottom = height * 0.055;
    const gridWidth = width - marginX * 2;
    const gridHeight = height - marginTop - marginBottom;
    const cellWidth = gridWidth / CARD_COLUMNS;
    const cellHeight = gridHeight / CARD_ROWS;
    const marked = new Set(state.card.markedIndices);

    context.clearRect(0, 0, width, height);
    context.fillStyle = state.active ? '#fdf3d9' : '#f4ead0';
    context.fillRect(0, 0, width, height);

    // Header strip with the card name, the way printed Italian cards carry the
    // series and the number of the card.
    context.fillStyle = state.active ? '#a8721b' : '#7d6742';
    context.fillRect(0, 0, width, marginTop * 0.78);
    context.fillStyle = '#fff8e6';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.font = `800 ${Math.round(marginTop * 0.46)}px Inter, system-ui, sans-serif`;
    context.fillText(state.title, marginX, marginTop * 0.39);
    context.textAlign = 'right';
    context.font = `700 ${Math.round(marginTop * 0.36)}px Inter, system-ui, sans-serif`;
    context.fillText('BINGO 90', width - marginX, marginTop * 0.39);

    for (let index = 0; index < state.card.cells.length; index += 1) {
      const value = state.card.cells[index] ?? null;
      const column = index % CARD_COLUMNS;
      const row = Math.floor(index / CARD_COLUMNS);
      const x = marginX + column * cellWidth;
      const y = marginTop + row * cellHeight;
      const isDrawn = value !== null && state.drawn.has(value);
      const isMarked = marked.has(index);
      const isMistake = isMarked && !isDrawn;

      context.fillStyle = value === null ? '#ddd0b0' : isDrawn ? '#fff0bd' : '#fffbf1';
      context.fillRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);
      context.strokeStyle = '#b7a582';
      context.lineWidth = 1.4;
      context.strokeRect(x + 1, y + 1, cellWidth - 2, cellHeight - 2);

      if (value === null) continue;

      context.fillStyle = '#2c2216';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = `800 ${Math.round(cellHeight * 0.6)}px Inter, system-ui, sans-serif`;
      context.fillText(String(value), x + cellWidth / 2, y + cellHeight / 2 + 1);

      if (!isMarked) continue;
      // Hand drawn ink: an ellipse the player would scribble, dashed when the
      // number was never called so mistakes stay visible and correctable.
      context.save();
      context.strokeStyle = isMistake ? '#dc2626' : state.markerColor;
      context.lineWidth = Math.max(2.2, cellHeight * 0.11);
      context.globalAlpha = 0.85;
      if (isMistake) context.setLineDash([5, 4]);
      context.beginPath();
      context.ellipse(
        x + cellWidth / 2,
        y + cellHeight / 2,
        cellWidth * 0.36,
        cellHeight * 0.34,
        ((index % 5) - 2) * 0.09,
        0,
        Math.PI * 2,
      );
      context.stroke();
      context.restore();
    }

    texture.needsUpdate = true;
  };

  return {
    texture,
    redraw,
    dispose: () => texture.dispose(),
  };
}

const BOARD_WIDTH = 1536;
const BOARD_HEIGHT = 512;

export interface NumberBoardTexture {
  readonly texture: THREE.CanvasTexture;
  readonly redraw: (drawn: readonly number[], current: number | null) => void;
  readonly dispose: () => void;
}

/**
 * The 1–90 tabellone that hangs on the wall of every Bingo hall.
 *
 * Nine columns of ten, drawn large enough to be legible from the far end of the
 * room, with the number just called ringed in gold.
 */
export function createNumberBoardTexture(): NumberBoardTexture | null {
  const canvas = createCanvas(BOARD_WIDTH, BOARD_HEIGHT);
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return null;
  const texture = finalise(canvas);

  const redraw = (drawn: readonly number[], current: number | null): void => {
    const called = new Set(drawn);
    const columns = 15;
    const rows = 6;
    const padX = 26;
    const padTop = 76;
    const padBottom = 22;
    const cellWidth = (BOARD_WIDTH - padX * 2) / columns;
    const cellHeight = (BOARD_HEIGHT - padTop - padBottom) / rows;

    context.fillStyle = '#150f24';
    context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    context.fillStyle = '#e9d8ff';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.font = '800 44px Inter, system-ui, sans-serif';
    context.fillText('TABELLONE 1 – 90', padX, padTop / 2);
    context.textAlign = 'right';
    context.fillStyle = '#8ee8de';
    context.font = '800 40px Inter, system-ui, sans-serif';
    context.fillText(`${called.size} / 90`, BOARD_WIDTH - padX, padTop / 2);

    for (let number = 1; number <= 90; number += 1) {
      const index = number - 1;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = padX + column * cellWidth;
      const y = padTop + row * cellHeight;
      const isCurrent = number === current;
      const isCalled = called.has(number);

      context.fillStyle = isCurrent ? '#f8b93c' : isCalled ? '#4c327d' : '#221a38';
      context.beginPath();
      context.roundRect(x + 4, y + 4, cellWidth - 8, cellHeight - 8, 10);
      context.fill();

      if (isCurrent) {
        context.strokeStyle = '#fff3cf';
        context.lineWidth = 5;
        context.stroke();
      }

      context.fillStyle = isCurrent ? '#2a1602' : isCalled ? '#ffffff' : '#5e5280';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = `800 ${Math.round(cellHeight * 0.5)}px Inter, system-ui, sans-serif`;
      context.fillText(String(number), x + cellWidth / 2, y + cellHeight / 2 + 2);
    }

    texture.needsUpdate = true;
  };

  return { texture, redraw, dispose: () => texture.dispose() };
}

export interface StageScreenTexture {
  readonly texture: THREE.CanvasTexture;
  readonly redraw: (state: StageScreenState) => void;
  readonly dispose: () => void;
}

export interface StageScreenState {
  readonly headline: string;
  readonly current: number | null;
  readonly recent: readonly number[];
  readonly footer: string;
  readonly accent: string;
}

/** Big screen above the stage: the number, the last calls and the round status. */
export function createStageScreenTexture(): StageScreenTexture | null {
  const width = 1024;
  const height = 512;
  const canvas = createCanvas(width, height);
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return null;
  const texture = finalise(canvas);

  const redraw = (state: StageScreenState): void => {
    context.fillStyle = '#0d0918';
    context.fillRect(0, 0, width, height);

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = state.accent;
    context.font = '800 46px Inter, system-ui, sans-serif';
    context.fillText(state.headline, width / 2, 62);

    if (state.current === null) {
      // Before the first draw there is no number to show. A 250px em-dash was
      // rendering as a bare yellow bar across the middle of the screen, which
      // reads as a broken display rather than as "not started yet".
      context.fillStyle = '#4c4270';
      context.font = '800 44px Inter, system-ui, sans-serif';
      context.fillText('in attesa del primo numero', width / 2, height / 2 - 18);
      context.fillStyle = '#2b2448';
      for (let dot = 0; dot < 3; dot += 1) {
        context.beginPath();
        context.arc(width / 2 + (dot - 1) * 54, height / 2 + 52, 15, 0, Math.PI * 2);
        context.fill();
      }
    } else {
      context.fillStyle = '#ffd166';
      context.font = '900 250px Inter, system-ui, sans-serif';
      context.fillText(String(state.current), width / 2, height / 2 + 12);
    }

    const ballRadius = 34;
    const spacing = ballRadius * 2 + 16;
    const recent = state.recent.slice(0, 6);
    const startX = width / 2 - ((recent.length - 1) * spacing) / 2;
    for (let index = 0; index < recent.length; index += 1) {
      const value = recent[index];
      if (value === undefined) continue;
      const x = startX + index * spacing;
      context.beginPath();
      context.fillStyle = '#f6c453';
      context.arc(x, height - 96, ballRadius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#361c02';
      context.font = '800 32px Inter, system-ui, sans-serif';
      context.fillText(String(value), x, height - 94);
    }

    // Clear of the bottom edge: at height - 30 the descenders were being cut
    // off by the screen bezel.
    context.fillStyle = '#9d8fd6';
    context.font = '700 30px Inter, system-ui, sans-serif';
    context.fillText(state.footer, width / 2, height - 42);
    texture.needsUpdate = true;
  };

  return { texture, redraw, dispose: () => texture.dispose() };
}
