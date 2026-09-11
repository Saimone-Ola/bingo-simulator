import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCardFaceTexture, type CardFaceState } from '../textures';

function canvasContext() {
  const context = {
    clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(),
    save: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(), ellipse: vi.fn(), stroke: vi.fn(),
  };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  return context;
}

const initial = (): CardFaceState => ({
  card: { id: 'test-card', index: 0, cells: [1, 12, null, 34, null, 55, null, 72, null], markedIndices: [] },
  drawn: new Set<number>(), markerColor: '#2563eb', title: 'CARTELLA 1', active: true,
});

afterEach(() => vi.unstubAllGlobals());

describe('card texture uploads', () => {
  it('does not repaint or upload identical snapshots or unrelated drawn numbers', () => {
    const context = canvasContext();
    const face = createCardFaceTexture()!;
    face.redraw(initial());
    const version = face.texture.version;
    for (let tick = 0; tick < 20; tick += 1) face.redraw({ ...initial(), drawn: new Set([90, 12]) });
    expect(face.texture.version).toBe(version);
    expect(context.clearRect).toHaveBeenCalledTimes(1);
    face.dispose();
  });

  it('repaints a new mark, its mistake correction, and its removal', () => {
    canvasContext();
    const face = createCardFaceTexture()!;
    const state = initial();
    face.redraw(state);
    const version = face.texture.version;
    state.card.markedIndices = [0];
    face.redraw(state);
    expect(face.texture.version).toBe(version + 1);
    face.redraw({ ...state, drawn: new Set([1]) });
    expect(face.texture.version).toBe(version + 2);
    face.redraw(initial());
    expect(face.texture.version).toBe(version + 3);
    face.dispose();
  });

  it('repaints changes to the card face, selection, title and marker', () => {
    canvasContext();
    const face = createCardFaceTexture()!;
    const state = initial();
    face.redraw(state);
    const version = face.texture.version;
    face.redraw({ ...state, active: false });
    face.redraw({ ...state, title: 'CARTELLA 2' });
    face.redraw({ ...state, markerColor: '#16a34a' });
    face.redraw({ ...state, card: { ...state.card, cells: [2, ...state.card.cells.slice(1)] } });
    expect(face.texture.version).toBe(version + 4);
    face.dispose();
  });
});
