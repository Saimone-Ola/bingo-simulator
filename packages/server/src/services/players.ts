import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { avatars, users } from '../db/schema';

/**
 * The projection the hub needs about a player: identity plus appearance.
 *
 * Nothing here is sensitive. Everything this returns ends up replicated to
 * every other player in the room, so the query selects columns explicitly
 * rather than returning the user row - a `select *` here would put the
 * password hash one careless spread away from the wire.
 */
export interface PlayerProfile {
  userId: string;
  displayName: string;
  level: number;
  status: 'active' | 'suspended' | 'deleted';
  appearance: {
    bodyType: string;
    skinTone: string;
    hairStyle: string;
    hairColor: string;
    shirtColor: string;
    pantsColor: string;
    heightCm: number;
  };
}

/** Fallback colours when a player has no avatar row yet. */
const DEFAULT_APPEARANCE: PlayerProfile['appearance'] = {
  bodyType: 'neutral',
  skinTone: '#e0b49a',
  hairStyle: 'short',
  hairColor: '#2b2118',
  shirtColor: '#7c5cff',
  pantsColor: '#2a2750',
  heightCm: 175,
};

/**
 * Derives the two garment colours from the avatar's stored `colorway`.
 * Phase 7 replaces this with real equipped items; the shape is already here so
 * the client's rendering path does not change when it does.
 */
function readColorway(colorway: unknown, key: string, fallback: string): string {
  if (typeof colorway !== 'object' || colorway === null) return fallback;
  const value = (colorway as Record<string, unknown>)[key];
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
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
      bodyType: row.bodyType ?? DEFAULT_APPEARANCE.bodyType,
      skinTone: row.skinTone ?? DEFAULT_APPEARANCE.skinTone,
      hairStyle: row.hairStyle ?? DEFAULT_APPEARANCE.hairStyle,
      hairColor: row.hairColor ?? DEFAULT_APPEARANCE.hairColor,
      shirtColor: readColorway(row.colorway, 'shirt', DEFAULT_APPEARANCE.shirtColor),
      pantsColor: readColorway(row.colorway, 'pants', DEFAULT_APPEARANCE.pantsColor),
      heightCm: row.heightCm ?? DEFAULT_APPEARANCE.heightCm,
    },
  };
}
