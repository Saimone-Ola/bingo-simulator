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

/** Material colours for the hall and characters. Mirrored in tokens.css. */
export const HALL_PALETTE = {
  background: WORLD_PALETTE.background,
  wall: '#25233d',
  wallSide: '#201e35',
  ceiling: '#302d49',
  carpet: '#24243f',
  carpetWeave: '#30304e',
  carpetShade: '#1e1d34',
  aisle: '#36334f',
  timber: '#695247',
  timberEdge: '#887164',
  felt: '#34474f',
  upholstery: '#554a76',
  metal: '#232132',
  trim: '#918ba9',
  key: '#fff2e2',
  fill: '#e5e0ff',
  interaction: '#9179ff',
  interactionLight: '#cdc2ff',
  ink: '#252132',
  paper: '#f7f3e9',
  paperMuted: '#e6e0d3',
  paperBlank: '#d5d0c7',
  paperGrid: '#b3ad9f',
  black: '#000000',
} as const;

export const AVATAR_PALETTE = {
  eyeWhite: '#fbf7f3',
  pupil: '#211b2c',
  highlight: '#ffffff',
  mouth: '#713d4a',
  blush: '#ce7d7e',
  shoe: '#282532',
  sole: '#ddd9d1',
} as const;

/** These values are saved in player preferences; do not change their identity. */
export const MARKER_PALETTE = ['#dc2626', '#2563eb', '#16a34a', '#7c3aed'] as const;
