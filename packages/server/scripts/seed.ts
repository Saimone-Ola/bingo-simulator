import { eq } from 'drizzle-orm';
import {
  SLOT_RTP_MAX,
  SLOT_RTP_MIN,
  slotPreset,
  type SlotVolatility,
} from '@bingo/shared';
import { closeDatabase, db } from '../src/db/client';
import { avatars, items, slotMachines, users } from '../src/db/schema';
import { hashPassword } from '../src/auth/password';
import { ensureWallet, postLedgerEntry } from '../src/services/ledger';
import { simulateSlotMachine } from '../src/services/slots';

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

/**
 * Machines to stand in the arcade on a fresh database.
 *
 * Without these the room is eleven cabinets all reading FUORI SERVIZIO, which
 * is not a bug in the arcade — there is genuinely nothing to play until someone
 * authors a machine. Two per volatility so the room shows a spread of feels
 * rather than four identical ones.
 */
const SEED_MACHINES: Array<{ name: string; description: string; volatility: SlotVolatility }> = [
  { name: 'Ciliegia Matta', description: 'Vincite piccole e continue.', volatility: 'low' },
  { name: 'Mille Luci', description: 'Ritmo tranquillo, poche sorprese.', volatility: 'low' },
  { name: 'Stella Blu', description: 'L’equilibrio classico da sala.', volatility: 'medium' },
  { name: 'Campana Grande', description: 'Un po’ di attesa, un po’ di premio.', volatility: 'medium' },
  { name: 'Sette d’Oro', description: 'Vincite rare, quando arrivano si sentono.', volatility: 'high' },
  { name: 'Notte Elettrica', description: 'Per chi ha pazienza.', volatility: 'high' },
  { name: 'Jolly Rosso', description: 'Quasi sempre niente. Quasi.', volatility: 'extreme' },
  { name: 'Fortuna Viola', description: 'La più cattiva della sala.', volatility: 'extreme' },
];

/**
 * Spins measured per machine at seed time.
 *
 * Publishing through the API runs a million; that would be eight million here
 * and would make `pnpm db:seed` take minutes. A hundred thousand is enough for
 * the RTP to have settled to well inside the window, and the figure stored is a
 * genuinely measured one — the database's CHECK constraint would refuse the row
 * otherwise, which is the point of having it.
 */
const SEED_SIMULATION_SPINS = 100_000;

async function seedSlotMachines(ownerId: string): Promise<void> {
  const existing = await db.select({ id: slotMachines.id }).from(slotMachines).limit(1);
  if (existing.length > 0) {
    console.log('- slot machines already present, skipping');
    return;
  }

  for (const machine of SEED_MACHINES) {
    const config = slotPreset(machine.volatility);
    const report = await simulateSlotMachine(config, SEED_SIMULATION_SPINS);

    if (report.rtp < SLOT_RTP_MIN || report.rtp > SLOT_RTP_MAX) {
      // A preset outside the window is a bug in the presets, not something to
      // paper over by writing a status the measurement does not support.
      console.warn(
        `- ${machine.name}: measured RTP ${(report.rtp * 100).toFixed(2)}% is outside the window, leaving as draft`,
      );
    }
    const publishable = report.problems.length === 0 && report.withinPublishWindow;

    await db.insert(slotMachines).values({
      ownerId,
      name: machine.name,
      description: machine.description,
      reels: config.reels,
      rows: config.rows,
      paylines: config.paylines,
      symbols: config.symbols,
      paytable: config.paytable,
      features: config.features,
      volatility: config.volatility,
      minBetCredits: 1,
      maxBetCredits: 100,
      rtpTheoretical: report.rtp.toFixed(4),
      rtpSimulated: report.rtp.toFixed(4),
      rtpSimulationSpins: report.spins,
      rtpComputedAt: new Date(),
      status: publishable ? 'published' : 'draft',
    });

    console.log(
      `- ${machine.name} (${machine.volatility}): RTP ${(report.rtp * 100).toFixed(2)}% su ${report.spins.toLocaleString('it-IT')} giri`,
    );
  }
}

async function main(): Promise<void> {
  console.log('Seeding items...');
  for (const item of STARTER_ITEMS) {
    await db.insert(items).values(item).onConflictDoNothing({ target: items.code });
  }

  console.log('Seeding users...');
  await upsertUser(SEED_ADMIN_EMAIL, 'Amministratore', SEED_ADMIN_PASSWORD, 'admin', 100_000);
  await upsertUser(SEED_PLAYER_EMAIL, 'Giocatore', SEED_PLAYER_PASSWORD, 'player', 1_000);

  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SEED_ADMIN_EMAIL))
    .limit(1);

  if (admin) {
    console.log('Seeding slot machines (simulating RTP, takes a moment)...');
    await seedSlotMachines(admin.id);
  }

  console.log('Seed complete.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
