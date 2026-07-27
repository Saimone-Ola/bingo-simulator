import { eq } from 'drizzle-orm';
import { closeDatabase, db } from '../src/db/client';
import { avatars, items, users } from '../src/db/schema';
import { hashPassword } from '../src/auth/password';
import { ensureWallet, postLedgerEntry } from '../src/services/ledger';

/**
 * Development seed: one admin, one ordinary player and a starter catalogue.
 * Safe to re-run - everything is keyed and skipped if already present.
 */
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@bingo.local';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'cambiami-subito-2026';
const SEED_PLAYER_EMAIL = process.env.SEED_PLAYER_EMAIL ?? 'giocatore@bingo.local';
const SEED_PLAYER_PASSWORD = process.env.SEED_PLAYER_PASSWORD ?? 'cambiami-subito-2026';

const STARTER_ITEMS = [
  {
    code: 'outfit_starter_tee',
    name: 'Maglietta base',
    category: 'outfit' as const,
    slot: 'torso' as const,
    rarity: 'common' as const,
    priceCredits: 0,
    purchasable: true,
    triangleCount: 900,
    tintable: true,
    atlasId: 'atlas_apparel_01',
  },
  {
    code: 'hat_party_cone',
    name: 'Cappellino festa',
    category: 'hat' as const,
    slot: 'head' as const,
    rarity: 'rare' as const,
    priceCredits: 750,
    purchasable: true,
    triangleCount: 420,
    tintable: true,
    atlasId: 'atlas_apparel_01',
  },
  {
    code: 'emote_applause',
    name: 'Applauso',
    category: 'emote' as const,
    slot: null,
    rarity: 'common' as const,
    priceCredits: 200,
    purchasable: true,
    triangleCount: 0,
    tintable: false,
    atlasId: null,
  },
];

async function upsertUser(
  email: string,
  displayName: string,
  password: string,
  role: 'admin' | 'player',
  welcomeCredits: number,
): Promise<void> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) {
    console.log(`- ${email} already exists, skipping`);
    return;
  }

  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email,
        displayName,
        passwordHash: await hashPassword(password),
        role,
        ageAcknowledgedAt: new Date(),
      })
      .returning({ id: users.id });

    if (!user) throw new Error('User insert returned nothing');

    await ensureWallet(tx, user.id);
    await tx.insert(avatars).values({ userId: user.id });

    if (welcomeCredits > 0) {
      await postLedgerEntry(tx, {
        userId: user.id,
        amount: welcomeCredits,
        reason: 'welcome_bonus',
        refType: 'user',
        refId: user.id,
        idempotencyKey: `welcome:${user.id}`,
      });
    }
  });

  console.log(`- created ${email} (${role})`);
}

async function main(): Promise<void> {
  console.log('Seeding items...');
  for (const item of STARTER_ITEMS) {
    await db.insert(items).values(item).onConflictDoNothing({ target: items.code });
  }

  console.log('Seeding users...');
  await upsertUser(SEED_ADMIN_EMAIL, 'Amministratore', SEED_ADMIN_PASSWORD, 'admin', 100_000);
  await upsertUser(SEED_PLAYER_EMAIL, 'Giocatore', SEED_PLAYER_PASSWORD, 'player', 1_000);

  console.log('Seed complete.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
