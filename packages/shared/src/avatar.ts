import { z } from 'zod';

/**
 * Avatar appearance shared by REST, realtime rooms and the renderer.
 *
 * Keeping the allowed values here prevents the UI, database and 3D client from
 * silently drifting apart as customisation options grow.
 *
 * Everything added after the first release is optional: an avatar saved before
 * faces were customisable still validates, and {@link resolveAvatarAppearance}
 * fills the gaps with the defaults the renderer expects.
 */
export const AVATAR_BODY_TYPES = ['neutral', 'slim', 'athletic', 'curvy'] as const;
export const AVATAR_HAIR_STYLES = ['short', 'buzz', 'bob', 'curly', 'long'] as const;
export const AVATAR_EYE_STYLES = ['round', 'soft', 'sharp', 'sleepy'] as const;
export const AVATAR_BROW_STYLES = ['neutral', 'arched', 'thick', 'worried'] as const;
export const AVATAR_MOUTH_STYLES = ['smile', 'neutral', 'grin', 'smirk'] as const;
export const AVATAR_ACCESSORIES = ['none', 'glasses', 'earrings', 'cap', 'scarf'] as const;
export const AVATAR_UPDATED_MESSAGE = 'avatar_updated' as const;

const colourSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a six digit hexadecimal colour');

export const avatarAppearanceSchema = z
  .object({
    bodyType: z.enum(AVATAR_BODY_TYPES),
    skinTone: colourSchema,
    hairStyle: z.enum(AVATAR_HAIR_STYLES),
    hairColor: colourSchema,
    shirtColor: colourSchema,
    pantsColor: colourSchema,
    heightCm: z.number().int().min(140).max(210),
    eyeStyle: z.enum(AVATAR_EYE_STYLES).optional(),
    eyeColor: colourSchema.optional(),
    browStyle: z.enum(AVATAR_BROW_STYLES).optional(),
    mouthStyle: z.enum(AVATAR_MOUTH_STYLES).optional(),
    accessory: z.enum(AVATAR_ACCESSORIES).optional(),
    accessoryColor: colourSchema.optional(),
  })
  .strict();

export type AvatarBodyType = (typeof AVATAR_BODY_TYPES)[number];
export type AvatarHairStyle = (typeof AVATAR_HAIR_STYLES)[number];
export type AvatarEyeStyle = (typeof AVATAR_EYE_STYLES)[number];
export type AvatarBrowStyle = (typeof AVATAR_BROW_STYLES)[number];
export type AvatarMouthStyle = (typeof AVATAR_MOUTH_STYLES)[number];
export type AvatarAccessory = (typeof AVATAR_ACCESSORIES)[number];
export type AvatarAppearance = z.infer<typeof avatarAppearanceSchema>;

/** An appearance with every optional field filled in, as the renderer needs it. */
export interface ResolvedAvatarAppearance extends AvatarAppearance {
  eyeStyle: AvatarEyeStyle;
  eyeColor: string;
  browStyle: AvatarBrowStyle;
  mouthStyle: AvatarMouthStyle;
  accessory: AvatarAccessory;
  accessoryColor: string;
}

export const DEFAULT_AVATAR_APPEARANCE: ResolvedAvatarAppearance = {
  bodyType: 'neutral',
  skinTone: '#e5b795',
  hairStyle: 'short',
  hairColor: '#2b2118',
  shirtColor: '#7c5cff',
  pantsColor: '#4a4585',
  heightCm: 175,
  eyeStyle: 'round',
  eyeColor: '#3c2a1f',
  browStyle: 'neutral',
  mouthStyle: 'smile',
  accessory: 'none',
  accessoryColor: '#f6c453',
};

/**
 * Fills in whatever an appearance is missing.
 *
 * Called on every render path, so it must stay allocation-cheap and total: a
 * partially saved or malformed avatar has to produce a character, never throw.
 */
export function resolveAvatarAppearance(
  appearance: Partial<AvatarAppearance> | null | undefined,
): ResolvedAvatarAppearance {
  if (!appearance) return DEFAULT_AVATAR_APPEARANCE;
  return {
    bodyType: appearance.bodyType ?? DEFAULT_AVATAR_APPEARANCE.bodyType,
    skinTone: appearance.skinTone ?? DEFAULT_AVATAR_APPEARANCE.skinTone,
    hairStyle: appearance.hairStyle ?? DEFAULT_AVATAR_APPEARANCE.hairStyle,
    hairColor: appearance.hairColor ?? DEFAULT_AVATAR_APPEARANCE.hairColor,
    shirtColor: appearance.shirtColor ?? DEFAULT_AVATAR_APPEARANCE.shirtColor,
    pantsColor: appearance.pantsColor ?? DEFAULT_AVATAR_APPEARANCE.pantsColor,
    heightCm: appearance.heightCm ?? DEFAULT_AVATAR_APPEARANCE.heightCm,
    eyeStyle: appearance.eyeStyle ?? DEFAULT_AVATAR_APPEARANCE.eyeStyle,
    eyeColor: appearance.eyeColor ?? DEFAULT_AVATAR_APPEARANCE.eyeColor,
    browStyle: appearance.browStyle ?? DEFAULT_AVATAR_APPEARANCE.browStyle,
    mouthStyle: appearance.mouthStyle ?? DEFAULT_AVATAR_APPEARANCE.mouthStyle,
    accessory: appearance.accessory ?? DEFAULT_AVATAR_APPEARANCE.accessory,
    accessoryColor: appearance.accessoryColor ?? DEFAULT_AVATAR_APPEARANCE.accessoryColor,
  };
}

export interface AvatarUpdatedPayload extends AvatarAppearance {
  sessionId: string;
}
