import { eq } from 'drizzle-orm';
import {
  AVATAR_ACCESSORIES,
  AVATAR_BROW_STYLES,
  AVATAR_EYE_STYLES,
  AVATAR_MOUTH_STYLES,
  type AvatarAppearance,
} from '@bingo/shared';
import { db } from '../db/client';
import { avatars, users } from '../db/schema';

/**
 * The projection every realtime room needs. Sensitive identity columns are
 * deliberately excluded because this object is replicated to other players.
 */
export interface PlayerProfile {
  userId: string;
  displayName: string;
  level: number;
  status: 'active' | 'suspended' | 'deleted';
  appearance: AvatarAppearance;
}

/** Fallback colours when a legacy player has no avatar row yet. */
export const DEFAULT_APPEARANCE: AvatarAppearance = {
  bodyType: 'neutral',
  skinTone: '#e0b49a',
  hairStyle: 'short',
  hairColor: '#2b2118',
  shirtColor: '#7c5cff',
  pantsColor: '#4a4585',
  heightCm: 175,
};

function readColorway(colorway: unknown, key: string, fallback: string): string {
  if (typeof colorway !== 'object' || colorway === null) return fallback;
  const value = (colorway as Record<string, unknown>)[key];
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

/**
 * Face and accessory choices live inside the existing `colorway` JSON column.
 *
 * They arrived after the avatars table shipped, and a JSON key needs no
 * migration, no backfill and no downtime — an avatar saved before they existed
 * simply reads back as `undefined` and the client applies its defaults.
 */
function readEnum<T extends string>(
  colorway: unknown,
  key: string,
  allowed: readonly T[],
): T | undefined {
  if (typeof colorway !== 'object' || colorway === null) return undefined;
  const value = (colorway as Record<string, unknown>)[key];
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function readOptionalColour(colorway: unknown, key: string): string | undefined {
  if (typeof colorway !== 'object' || colorway === null) return undefined;
  const value = (colorway as Record<string, unknown>)[key];
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined;
}

export async function loadPlayerProfile(userId: string): Promise<PlayerProfile | null> {
  const [row] = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      level: users.level,
      status: users.status,
      bodyType: avatars.bodyType,
      skinTone: avatars.skinTone,
      hairStyle: avatars.hairStyle,
      hairColor: avatars.hairColor,
      heightCm: avatars.heightCm,
      colorway: avatars.colorway,
    })
    .from(users)
    .leftJoin(avatars, eq(avatars.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;

  return {
    userId: row.userId,
    displayName: row.displayName,
    level: row.level,
    status: row.status,
    appearance: {
      bodyType: (row.bodyType ?? DEFAULT_APPEARANCE.bodyType) as AvatarAppearance['bodyType'],
      skinTone: row.skinTone ?? DEFAULT_APPEARANCE.skinTone,
      hairStyle: (row.hairStyle ?? DEFAULT_APPEARANCE.hairStyle) as AvatarAppearance['hairStyle'],
      hairColor: row.hairColor ?? DEFAULT_APPEARANCE.hairColor,
      shirtColor: readColorway(row.colorway, 'shirt', DEFAULT_APPEARANCE.shirtColor),
      pantsColor: readColorway(row.colorway, 'pants', DEFAULT_APPEARANCE.pantsColor),
      heightCm: row.heightCm ?? DEFAULT_APPEARANCE.heightCm,
      eyeStyle: readEnum(row.colorway, 'eyeStyle', AVATAR_EYE_STYLES),
      eyeColor: readOptionalColour(row.colorway, 'eyeColor'),
      browStyle: readEnum(row.colorway, 'browStyle', AVATAR_BROW_STYLES),
      mouthStyle: readEnum(row.colorway, 'mouthStyle', AVATAR_MOUTH_STYLES),
      accessory: readEnum(row.colorway, 'accessory', AVATAR_ACCESSORIES),
      accessoryColor: readOptionalColour(row.colorway, 'accessoryColor'),
    },
  };
}

/**
 * Persists a complete appearance in one transaction-sized statement. The
 * unique user key makes the operation idempotent and also repairs old accounts
 * that predate the avatar row.
 */
export async function saveAvatarAppearance(
  userId: string,
  appearance: AvatarAppearance,
): Promise<AvatarAppearance> {
  const values = {
    userId,
    bodyType: appearance.bodyType,
    skinTone: appearance.skinTone,
    hairStyle: appearance.hairStyle,
    hairColor: appearance.hairColor,
    heightCm: appearance.heightCm,
    colorway: {
      shirt: appearance.shirtColor,
      pants: appearance.pantsColor,
      eyeStyle: appearance.eyeStyle,
      eyeColor: appearance.eyeColor,
      browStyle: appearance.browStyle,
      mouthStyle: appearance.mouthStyle,
      accessory: appearance.accessory,
      accessoryColor: appearance.accessoryColor,
    },
    updatedAt: new Date(),
  };

  await db
    .insert(avatars)
    .values(values)
    .onConflictDoUpdate({
      target: avatars.userId,
      set: {
        bodyType: values.bodyType,
        skinTone: values.skinTone,
        hairStyle: values.hairStyle,
        hairColor: values.hairColor,
        heightCm: values.heightCm,
        colorway: values.colorway,
        updatedAt: values.updatedAt,
      },
    });

  return appearance;
}
