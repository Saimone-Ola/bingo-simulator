import { createHash, createHmac, randomUUID } from 'node:crypto';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import {
  SLOT_PUBLISH_SIMULATION_SPINS,
  SLOT_RTP_MAX,
  SLOT_RTP_MIN,
  analyticLineRtp,
  compareSlotRtp,
  emptySimulation,
  simulateSlotBatch,
  slotConfigFingerprint,
  slotTotalBet,
  spinSlot,
  validateSlotConfig,
  type SlotConfig,
  type SlotMachineDetail,
  type SlotMachineSummary,
  type SlotSimulationReport,
  type SlotSpinResponse,
  type SlotStatus,
} from '@bingo/shared';
import { db } from '../db/client';
import { slotMachines, slotSpins, users } from '../db/schema';
import { env } from '../env';
import { AppError } from '../errors';
import { getWalletState, postLedgerEntryAtomic } from './ledger';

/**
 * Slot machines: authoring, verification and play.
 *
 * Two rules hold everything else up.
 *
 * The client never learns an outcome it did not receive from here, and never
 * sends one. It posts a bet; the grid, the wins and the RTP are all computed
 * server side from the stored configuration.
 *
 * Every credit that moves is a ledger entry. There is no path in this file
 * that changes a balance without writing one, and both the bet and the win
 * carry an idempotency key derived from the caller's request id, so a retried
 * request after a dropped connection cannot charge or pay twice.
 */

/**
 * Per-spin seed, derived rather than stored.
 *
 * `HMAC(secret, machine:nonce)` means the seed for any nonce exists before the
 * spin does, so its hash can be published in advance and checked afterwards
 * against the revealed seed — without a table of unspent seeds to keep in step
 * with the spins themselves. The secret never leaves the server; the seed is
 * revealed only once its spin is resolved and recorded.
 */
function seedSecret(): string {
  // Derived from the refresh secret rather than adding another required
  // variable to every deployment. It is a different keyspace because the HMAC
  // is domain separated by the literal prefix.
  return createHmac('sha256', env.AUTH_REFRESH_SECRET).update('slot-seed-v1').digest('hex');
}

export function slotSeedFor(machineId: string, nonce: number): string {
  return createHmac('sha256', seedSecret()).update(`${machineId}:${nonce}`).digest('hex');
}

export function slotSeedHash(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

/** Commitments for the next spins on a machine, publishable before play. */
export function slotCommitments(machineId: string, fromNonce: number, count = 5) {
  return Array.from({ length: count }, (_value, index) => {
    const nonce = fromNonce + index;
    return { nonce, serverSeedHash: slotSeedHash(slotSeedFor(machineId, nonce)) };
  });
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

interface MachineRow {
  id: string;
  ownerId: string;
  ownerName: string | null;
  name: string;
  description: string | null;
  reels: number;
  rows: number;
  paylines: unknown;
  symbols: unknown;
  paytable: unknown;
  features: unknown;
  volatility: string;
  minBetCredits: number;
  maxBetCredits: number;
  rtpTheoretical: string | null;
  rtpSimulated: string | null;
  rtpSimulationSpins: number | null;
  status: string;
  rejectionReason: string | null;
  version: number;
  configHash: string | null;
  totalSpins: number;
}

function configFromRow(row: MachineRow): SlotConfig {
  return {
    reels: row.reels,
    rows: row.rows,
    paylines: row.paylines as number[][],
    symbols: row.symbols as SlotConfig['symbols'],
    paytable: row.paytable as SlotConfig['paytable'],
    features: row.features as SlotConfig['features'],
    volatility: row.volatility as SlotConfig['volatility'],
  };
}

function summaryFromRow(row: MachineRow, viewerId: string): SlotMachineSummary {
  const config = configFromRow(row);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.ownerId,
    ownerName: row.ownerName ?? 'Anonimo',
    volatility: config.volatility,
    status: row.status as SlotStatus,
    version: row.version,
    minBetCredits: row.minBetCredits,
    maxBetCredits: row.maxBetCredits,
    rtpTheoretical: row.rtpTheoretical === null ? null : Number(row.rtpTheoretical),
    rtpSimulated: row.rtpSimulated === null ? null : Number(row.rtpSimulated),
    rtpSimulationSpins: row.rtpSimulationSpins,
    paylineCount: config.paylines.length,
    totalSpins: row.totalSpins,
    isMine: row.ownerId === viewerId,
  };
}

const machineColumns = {
  id: slotMachines.id,
  ownerId: slotMachines.ownerId,
  ownerName: users.displayName,
  name: slotMachines.name,
  description: slotMachines.description,
  reels: slotMachines.reels,
  rows: slotMachines.rows,
  paylines: slotMachines.paylines,
  symbols: slotMachines.symbols,
  paytable: slotMachines.paytable,
  features: slotMachines.features,
  volatility: slotMachines.volatility,
  minBetCredits: slotMachines.minBetCredits,
  maxBetCredits: slotMachines.maxBetCredits,
  rtpTheoretical: slotMachines.rtpTheoretical,
  rtpSimulated: slotMachines.rtpSimulated,
  rtpSimulationSpins: slotMachines.rtpSimulationSpins,
  status: slotMachines.status,
  rejectionReason: slotMachines.rejectionReason,
  version: slotMachines.version,
  configHash: slotMachines.configHash,
  totalSpins: slotMachines.totalSpins,
};

/**
 * Machines a player may see: everything published, plus their own drafts.
 *
 * Own machines sort first, which is what someone who just authored one expects
 * to find when they open the browser.
 */
export async function listSlotMachines(
  viewerId: string,
  options: { mine?: boolean; volatility?: string; limit: number },
): Promise<SlotMachineSummary[]> {
  const visible = options.mine
    ? eq(slotMachines.ownerId, viewerId)
    : or(eq(slotMachines.status, 'published'), eq(slotMachines.ownerId, viewerId));

  const rows = await db
    .select(machineColumns)
    .from(slotMachines)
    .leftJoin(users, eq(users.id, slotMachines.ownerId))
    .where(
      options.volatility
        ? and(visible, eq(slotMachines.volatility, options.volatility as never))
        : visible,
    )
    .orderBy(desc(slotMachines.updatedAt))
    .limit(options.limit);

  return rows
    .map((row) => summaryFromRow(row as MachineRow, viewerId))
    .sort((left, right) => Number(right.isMine) - Number(left.isMine));
}

export async function getSlotMachine(
  machineId: string,
  viewerId: string,
): Promise<SlotMachineDetail> {
  const [row] = await db
    .select(machineColumns)
    .from(slotMachines)
    .leftJoin(users, eq(users.id, slotMachines.ownerId))
    .where(eq(slotMachines.id, machineId))
    .limit(1);

  if (!row) throw AppError.notFound('Slot machine not found');
  const machine = row as MachineRow;
  if (machine.status !== 'published' && machine.ownerId !== viewerId) {
    throw AppError.notFound('Slot machine not found');
  }

  return {
    ...summaryFromRow(machine, viewerId),
    config: configFromRow(machine),
    configHash: machine.configHash,
    rejectionReason: machine.rejectionReason,
  };
}

/* ------------------------------------------------------------------ *
 * Verification
 * ------------------------------------------------------------------ */

/**
 * Runs a simulation without holding the event loop.
 *
 * A million spins is a second or so of solid CPU; done in one go it would stall
 * every other request on the process, including the realtime rooms. Chunking it
 * and yielding between slices costs nothing measurable and keeps the server
 * answering while a machine is being verified.
 */
export async function simulateSlotMachine(
  config: SlotConfig,
  spins: number,
  seed = randomUUID(),
): Promise<SlotSimulationReport> {
  const problems = validateSlotConfig(config);
  if (problems.length > 0) {
    return {
      spins: 0,
      rtp: 0,
      analyticLineRtp: 0,
      drift: 0,
      hitFrequency: 0,
      maxWinMultiplier: 0,
      freeSpinTriggerRate: 0,
      distribution: {},
      withinPublishWindow: false,
      problems,
    };
  }

  const CHUNK = 25_000;
  const accumulator = emptySimulation();
  for (let done = 0; done < spins; done += CHUNK) {
    simulateSlotBatch(config, seed, done + 1, Math.min(CHUNK, spins - done), accumulator);
    await new Promise((resolve) => setImmediate(resolve));
  }

  const comparison = compareSlotRtp(config, accumulator);
  return {
    spins: accumulator.spins,
    rtp: accumulator.rtp,
    analyticLineRtp: comparison.analyticLineRtp,
    drift: comparison.drift,
    hitFrequency: accumulator.spins > 0 ? accumulator.hitFrequency / accumulator.spins : 0,
    maxWinMultiplier: accumulator.maxWinMultiplier,
    freeSpinTriggerRate:
      accumulator.spins > 0 ? accumulator.freeSpinTriggers / accumulator.spins : 0,
    distribution: accumulator.distribution,
    withinPublishWindow: comparison.withinPublishWindow,
    problems: [],
  };
}

/* ------------------------------------------------------------------ *
 * Authoring
 * ------------------------------------------------------------------ */

export interface SaveMachineInput {
  name: string;
  description?: string | undefined;
  config: SlotConfig;
  minBetCredits: number;
  maxBetCredits: number;
}

function assertPlayable(config: SlotConfig): void {
  const problems = validateSlotConfig(config);
  if (problems.length > 0) {
    throw AppError.validation('Slot configuration is not playable', { config: problems });
  }
}

export async function createSlotMachine(
  ownerId: string,
  input: SaveMachineInput,
): Promise<SlotMachineDetail> {
  assertPlayable(input.config);
  if (input.minBetCredits > input.maxBetCredits) {
    throw AppError.validation('Bet range is inverted', { minBetCredits: ['Above the maximum'] });
  }

  const [created] = await db
    .insert(slotMachines)
    .values({
      ownerId,
      name: input.name,
      description: input.description ?? null,
      reels: input.config.reels,
      rows: input.config.rows,
      paylines: input.config.paylines,
      symbols: input.config.symbols,
      paytable: input.config.paytable,
      features: input.config.features,
      volatility: input.config.volatility,
      minBetCredits: input.minBetCredits,
      maxBetCredits: input.maxBetCredits,
      // Computed here, never accepted from the client.
      rtpTheoretical: analyticLineRtp(input.config).toFixed(4),
      configHash: slotConfigFingerprint(input.config),
      status: 'draft',
    })
    .returning({ id: slotMachines.id });

  if (!created) throw AppError.internal('Could not create the slot machine');
  return getSlotMachine(created.id, ownerId);
}

async function loadOwned(machineId: string, ownerId: string): Promise<MachineRow> {
  const [row] = await db
    .select(machineColumns)
    .from(slotMachines)
    .leftJoin(users, eq(users.id, slotMachines.ownerId))
    .where(eq(slotMachines.id, machineId))
    .limit(1);
  if (!row) throw AppError.notFound('Slot machine not found');
  const machine = row as MachineRow;
  if (machine.ownerId !== ownerId) throw AppError.forbidden('Not your slot machine');
  return machine;
}

/**
 * Saves an edit.
 *
 * An edit to a published machine bumps `version` and drops it back to draft:
 * spins already recorded point at the version they were resolved against, so
 * changing the reels can never rewrite what a past spin paid.
 */
export async function updateSlotMachine(
  machineId: string,
  ownerId: string,
  input: SaveMachineInput,
): Promise<SlotMachineDetail> {
  const existing = await loadOwned(machineId, ownerId);
  assertPlayable(input.config);

  const nextHash = slotConfigFingerprint(input.config);
  const changed = nextHash !== existing.configHash;

  await db
    .update(slotMachines)
    .set({
      name: input.name,
      description: input.description ?? null,
      reels: input.config.reels,
      rows: input.config.rows,
      paylines: input.config.paylines,
      symbols: input.config.symbols,
      paytable: input.config.paytable,
      features: input.config.features,
      volatility: input.config.volatility,
      minBetCredits: input.minBetCredits,
      maxBetCredits: input.maxBetCredits,
      rtpTheoretical: analyticLineRtp(input.config).toFixed(4),
      configHash: nextHash,
      version: changed ? existing.version + 1 : existing.version,
      status: changed ? 'draft' : (existing.status as SlotStatus),
      rtpSimulated: changed ? null : existing.rtpSimulated,
      rtpSimulationSpins: changed ? null : existing.rtpSimulationSpins,
      updatedAt: new Date(),
    })
    .where(eq(slotMachines.id, machineId));

  return getSlotMachine(machineId, ownerId);
}

/**
 * Verifies a machine and publishes it if it is inside the window.
 *
 * The simulation is run here, by the server, on the stored configuration —
 * never trusting a figure the editor showed the author. The database refuses a
 * published row outside 0.85–0.98 as well, so this check and that constraint
 * have to agree before anything becomes playable.
 */
export async function publishSlotMachine(
  machineId: string,
  ownerId: string,
): Promise<{ machine: SlotMachineDetail; report: SlotSimulationReport }> {
  const existing = await loadOwned(machineId, ownerId);
  const config = configFromRow(existing);
  const report = await simulateSlotMachine(config, SLOT_PUBLISH_SIMULATION_SPINS);

  const measured = report.rtp;
  const acceptable =
    report.problems.length === 0 && measured >= SLOT_RTP_MIN && measured <= SLOT_RTP_MAX;

  await db
    .update(slotMachines)
    .set({
      // The published RTP is the measured one: it is the figure that includes
      // scatters and the free spin feedback, and it is what the window is about.
      rtpTheoretical: measured.toFixed(4),
      rtpSimulated: measured.toFixed(4),
      rtpSimulationSpins: report.spins,
      rtpComputedAt: new Date(),
      status: acceptable ? 'published' : 'rejected',
      rejectionReason: acceptable
        ? null
        : report.problems.length > 0
          ? `Configurazione non valida: ${report.problems.join(', ')}`
          : `RTP misurato ${(measured * 100).toFixed(2)}% fuori dalla finestra ${(SLOT_RTP_MIN * 100).toFixed(0)}–${(SLOT_RTP_MAX * 100).toFixed(0)}%`,
      updatedAt: new Date(),
    })
    .where(eq(slotMachines.id, machineId));

  return { machine: await getSlotMachine(machineId, ownerId), report };
}

/* ------------------------------------------------------------------ *
 * Playing
 * ------------------------------------------------------------------ */

/**
 * Resolves one spin and moves the credits.
 *
 * Order matters: the bet is debited *before* the reels are read, so a player
 * who cannot afford the spin never learns what it would have been. The nonce is
 * reserved with an atomic increment, which is what makes it unique under
 * concurrency without a lock — two simultaneous spins get two different nonces
 * and therefore two different seeds.
 */
export async function spinSlotMachine(
  machineId: string,
  userId: string,
  betPerLine: number,
  requestId: string,
): Promise<SlotSpinResponse> {
  const [row] = await db
    .select(machineColumns)
    .from(slotMachines)
    .leftJoin(users, eq(users.id, slotMachines.ownerId))
    .where(eq(slotMachines.id, machineId))
    .limit(1);
  if (!row) throw AppError.notFound('Slot machine not found');

  const machine = row as MachineRow;
  // A draft is playable by its author, so a machine can be tried before being
  // published. Everyone else only ever reaches a published one.
  if (machine.status !== 'published' && machine.ownerId !== userId) {
    throw AppError.notFound('Slot machine not found');
  }

  const config = configFromRow(machine);
  const totalBet = slotTotalBet(config, betPerLine);
  if (betPerLine < machine.minBetCredits || totalBet > machine.maxBetCredits * config.paylines.length) {
    throw AppError.validation('Bet outside the machine range', {
      betPerLine: ['Fuori dai limiti della macchina'],
    });
  }

  const bet = await postLedgerEntryAtomic({
    userId,
    amount: -totalBet,
    reason: 'slot_bet',
    refType: 'slot_spin',
    idempotencyKey: `slot:${machineId}:${userId}:${requestId}:bet`,
    metadata: { machineId, betPerLine, paylines: config.paylines.length },
  });

  // Atomic reservation: the returned counter is this spin's nonce and nobody
  // else can be handed the same one.
  const [reserved] = await db
    .update(slotMachines)
    .set({
      totalSpins: sql`${slotMachines.totalSpins} + 1`,
      totalWagered: sql`${slotMachines.totalWagered} + ${totalBet}`,
      updatedAt: new Date(),
    })
    .where(eq(slotMachines.id, machineId))
    .returning({ nonce: slotMachines.totalSpins });

  const nonce = reserved?.nonce ?? 1;
  const serverSeed = slotSeedFor(machineId, nonce);
  const result = spinSlot(config, serverSeed, nonce, betPerLine);

  // Free spins are resolved immediately and in the same record: they are part
  // of the outcome of this bet, not a separate wager.
  let freeSpinWin = 0;
  const feature = config.features.freeSpins;
  if (result.freeSpinsAwarded > 0 && feature) {
    for (let index = 0; index < result.freeSpinsAwarded; index += 1) {
      freeSpinWin += spinSlot(
        config,
        `${serverSeed}:free`,
        nonce * 1000 + index,
        betPerLine,
        feature.multiplier,
      ).totalWin;
    }
  }

  const winCredits = result.totalWin + freeSpinWin;
  let balanceAfter = bet.balanceAfter;
  let winEntryId: string | null = null;

  if (winCredits > 0) {
    const win = await postLedgerEntryAtomic({
      userId,
      amount: winCredits,
      reason: 'slot_win',
      refType: 'slot_spin',
      idempotencyKey: `slot:${machineId}:${userId}:${requestId}:win`,
      metadata: { machineId, nonce },
    });
    balanceAfter = win.balanceAfter;
    winEntryId = win.id;
  }

  const [recorded] = await db
    .insert(slotSpins)
    .values({
      machineId,
      machineVersion: machine.version,
      userId,
      betCredits: totalBet,
      winCredits,
      serverSeedHash: slotSeedHash(serverSeed),
      serverSeed,
      nonce,
      resultGrid: result.grid,
      lineWins: result.lineWins,
      featureResults: {
        scatterCount: result.scatterCount,
        freeSpinsAwarded: result.freeSpinsAwarded,
        freeSpinWin,
      },
      betLedgerEntryId: bet.id,
      winLedgerEntryId: winEntryId,
    })
    .returning({ id: slotSpins.id });

  if (winCredits > 0) {
    await db
      .update(slotMachines)
      .set({ totalPaidOut: sql`${slotMachines.totalPaidOut} + ${winCredits}` })
      .where(eq(slotMachines.id, machineId));
  }

  return {
    spinId: recorded?.id ?? randomUUID(),
    machineId,
    machineVersion: machine.version,
    nonce,
    serverSeedHash: slotSeedHash(serverSeed),
    serverSeed,
    grid: result.grid,
    lineWins: result.lineWins,
    scatterCount: result.scatterCount,
    scatterCredits: result.scatterCredits,
    freeSpinsAwarded: result.freeSpinsAwarded,
    freeSpinWin,
    betCredits: totalBet,
    winCredits,
    nearMiss: result.nearMiss,
    balanceAfter,
  };
}

/** Current balance, for the arcade HUD after a reconnect. */
export async function slotPlayerBalance(userId: string): Promise<number> {
  const wallet = await getWalletState(db, userId);
  return wallet.balance;
}
