import { z } from 'zod';

/**
 * Avatar appearance shared by REST, realtime rooms and the renderer.
 *
 * Keeping the allowed values here prevents the UI, database and 3D client from
 * silently drifting apart as customisation options grow.
 */
export const AVATAR_BODY_TYPES = ['neutral', 'slim', 'athletic', 'curvy'] as const;
export const AVATAR_HAIR_STYLES = ['short', 'buzz', 'bob', 'curly', 'long'] as const;
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
  })
  .strict();

export type AvatarBodyType = (typeof AVATAR_BODY_TYPES)[number];
export type AvatarHairStyle = (typeof AVATAR_HAIR_STYLES)[number];
export type AvatarAppearance = z.infer<typeof avatarAppearanceSchema>;

export interface AvatarUpdatedPayload extends AvatarAppearance {
  sessionId: string;
}
