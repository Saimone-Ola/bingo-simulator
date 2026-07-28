/**
 * The design tokens, mirrored for the 3D layer.
 *
 * Three.js materials and lights cannot read CSS custom properties, so the
 * handful of token values the world needs are restated here as constants. This
 * file is the only permitted duplication of a token value: keep it in sync with
 * styles/tokens.css, and never write a raw hex anywhere else in src/three.
 */
export const WORLD_PALETTE = {
  /** Matches --color-surface-900 so canvas and page share one background. */
  background: '#0b0a1a',
  fog: '#0b0a1a',

  /** --color-brand-500 / --color-accent-500 */
  brand: '#7c5cff',
  accent: '#ffb020',

  /** --color-surface-600 / --color-surface-500 */
  gridCell: '#2a2750',
  gridSection: '#423d70',

  /** Key light is neutral; the fill carries the stage violet. */
  keyLight: '#ffffff',
  fillLight: '#8a7dff',
  bounceLight: '#120f26',
} as const;

/** Fog distances, tuned to the hub's scale in metres. */
export const WORLD_FOG = { near: 12, far: 30 } as const;
