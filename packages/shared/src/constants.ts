/**
 * Cross-cutting constants shared by client and server.
 *
 * Anything in this file is safe to ship to the browser. Never put secrets,
 * payout tables or RNG parameters here: those live server side only.
 */

/** Display name rules, enforced on both ends (server is authoritative). */
export const DISPLAY_NAME_MIN_LENGTH = 3;
export const DISPLAY_NAME_MAX_LENGTH = 20;
/** Letters, digits, underscore and a single inner space/dash between chunks. */
export const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N}_ -]{1,18}[\p{L}\p{N}])$/u;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Theoretical RTP window a user-authored slot machine must fall into. */
export const SLOT_RTP_MIN = 0.85;
export const SLOT_RTP_MAX = 0.98;

/** Supported bingo ball sets. `custom` is validated against these bounds. */
export const BINGO_BALL_COUNTS = [75, 90] as const;
export const BINGO_CUSTOM_BALLS_MIN = 30;
export const BINGO_CUSTOM_BALLS_MAX = 120;

/** Hub performance budget - enforced by asset tooling and reviewed in CI. */
export const AVATAR_TRIANGLE_BUDGET = 8_000;
export const HUB_MAX_AVATARS = 20;
export const TARGET_FPS = 60;

/** Interface locales. Copy is Italian first, English is the fallback. */
export const LOCALES = ['it', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'it';

/** Advisory age gate. Bingo Simulator has no real-money features at all. */
export const ADVISED_MIN_AGE = 18;


/**
 * Most cards one player may hold in a round.
 *
 * A regular at a real hall buys a fistful and marks them with the little
 * machine on the table, which is what makes fifty playable rather than
 * frantic. The limit exists so a single wallet cannot buy the whole pot.
 */
export const MAX_CARDS_PER_PLAYER = 50;

/** How long the sellers work the room before the round starts. */
export const DEFAULT_PURCHASE_SECONDS = 120;
