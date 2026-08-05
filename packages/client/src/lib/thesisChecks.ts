/**
 * Claims the project makes, checked by running the real code.
 *
 * The presentation mode used to state its properties as text: a chip reading
 * "RNG separato dagli eventi" is a promise, not evidence. Everything here is
 * computed in the browser, at the moment it is displayed, by calling the same
 * `@bingo/shared` functions the server calls. If one of these ever goes red on
 * screen it is because the property stopped holding, not because a label went
 * stale.
 *
 * What cannot be checked here is as informative as what can. There is no card
 * generator in this list because the client does not have one: cards are made
 * on the server and arrive already drawn. That absence is the architecture.
 */

import {
  DEBIT_ONLY_REASONS,
  SLOT_RTP_MAX,
  SLOT_RTP_MIN,
  analyticLineRtp,
  createAvatarMotion,
  emptySimulation,
  isLedgerAmountSignValid,
  simulateSlotBatch,
  slotPreset,
  spinSlot,
  stepAvatarMotion,
  type SlotVolatility,
} from '@bingo/shared';

export interface CheckResult {
  id: string;
  title: string;
  /** What the claim would mean if it failed. */
  claim: string;
  passed: boolean;
  /** The measured value, phrased for a reader rather than a log. */
  evidence: string;
  /** Where to look in the source for the thing being checked. */
  source: string;
}

const RECONCILE_THRESHOLD_METRES = 0.75;

/**
 * The same seed reproduces the same reels, and a different nonce does not.
 *
 * This is the whole of "provably fair": the server publishes the hash of a seed
 * before the spin and reveals the seed after, and anyone can re-run this
 * function to confirm the grid they were shown is the grid that seed produces.
 */
export function checkSlotDeterminism(): CheckResult {
  const config = slotPreset('medium');
  const seed = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

  const first = spinSlot(config, seed, 7, 1);
  const again = spinSlot(config, seed, 7, 1);
  const other = spinSlot(config, seed, 8, 1);

  const reproducible = JSON.stringify(first.grid) === JSON.stringify(again.grid);
  const distinct = JSON.stringify(first.grid) !== JSON.stringify(other.grid);

  return {
    id: 'slot-determinism',
    title: 'Un giro è riproducibile dal suo seed',
    claim:
      'Se lo stesso seed desse rulli diversi, nessuno potrebbe verificare una giocata: la promessa "provably fair" sarebbe vuota.',
    passed: reproducible && distinct,
    evidence: reproducible
      ? `Giro #7 rieseguito ora: ${first.grid.map((reel) => reel[0]).join(' · ')} — identico. Giro #8, stesso seed: rulli diversi.`
      : 'Lo stesso seed ha prodotto due griglie diverse.',
    source: 'packages/shared/src/slots.ts · spinSlot',
  };
}

/**
 * Client and server integrate the avatar on different clocks.
 *
 * The claim is not that they agree exactly — they cannot — but that the gap
 * stays far under the distance at which the client stops trusting its own
 * prediction and is pulled to the server's position.
 */
export function checkMotionAgreement(): CheckResult {
  const intent = { dirX: 0, dirZ: 1, run: false };
  const client = createAvatarMotion(0, 0);
  const server = createAvatarMotion(0, 0);

  for (let i = 0; i < 3 * 60; i += 1) stepAvatarMotion(client, intent, 1 / 60);
  for (let i = 0; i < 3 * 20; i += 1) stepAvatarMotion(server, intent, 1 / 20);

  const gap = Math.hypot(client.x - server.x, client.z - server.z);

  return {
    id: 'motion-agreement',
    title: 'Predizione e simulazione autorevole restano allineate',
    claim:
      'Se il client a 60 Hz e il server a 20 Hz divergessero, il giocatore vedrebbe correzioni di posizione continue.',
    passed: gap < RECONCILE_THRESHOLD_METRES / 4,
    evidence: `Dopo 3 secondi di cammino con lo stesso comando: ${(gap * 100).toFixed(1)} cm di scarto, contro una soglia di riconciliazione di ${(RECONCILE_THRESHOLD_METRES * 100).toFixed(0)} cm.`,
    source: 'packages/shared/src/avatarMotion.ts · stepAvatarMotion',
  };
}

/**
 * The ledger refuses an entry whose sign contradicts its reason.
 *
 * An acquisto that credited the player, or a vincita that debited them, is the
 * kind of mistake that a double-entry book exists to make impossible.
 */
export function checkLedgerSigns(): CheckResult {
  const debitOnly = [...DEBIT_ONLY_REASONS];
  const wrongWay = debitOnly.filter((reason) => isLedgerAmountSignValid(reason, 100));
  const rightWay = debitOnly.every((reason) => isLedgerAmountSignValid(reason, -100));

  return {
    id: 'ledger-signs',
    title: 'Una causale di addebito non può accreditare',
    claim:
      'Se un acquisto potesse avere importo positivo, il saldo si potrebbe gonfiare con una scrittura formalmente valida.',
    passed: wrongWay.length === 0 && rightWay,
    evidence: `${debitOnly.length} causali di solo addebito verificate: tutte rifiutate con segno positivo, tutte accettate con segno negativo.`,
    source: 'packages/shared/src/ledger.ts · isLedgerAmountSignValid',
  };
}

/**
 * Every preset's base game sits under the ceiling the window allows.
 *
 * The analytic figure ignores scatters and free spins, so it can only be a
 * lower bound: a preset already over the ceiling here could never be published,
 * whatever a simulation said afterwards.
 */
export function checkPresetCeilings(): CheckResult {
  const volatilities: SlotVolatility[] = ['low', 'medium', 'high', 'extreme'];
  const measured = volatilities.map((volatility) => ({
    volatility,
    rtp: analyticLineRtp(slotPreset(volatility)),
  }));
  const worst = measured.reduce((a, b) => (a.rtp > b.rtp ? a : b));

  return {
    id: 'preset-ceilings',
    title: 'Nessun preset sfora il tetto sul solo gioco base',
    claim:
      'Le funzioni aggiungono soltanto ritorno: una macchina già sopra il tetto senza di esse non potrebbe mai rientrare.',
    passed: measured.every((entry) => entry.rtp <= SLOT_RTP_MAX),
    evidence: `Calcolato ora per i quattro preset. Il più generoso è "${worst.volatility}" con ${(worst.rtp * 100).toFixed(2)}% di sole linee, contro un tetto del ${(SLOT_RTP_MAX * 100).toFixed(0)}%.`,
    source: 'packages/shared/src/slots.ts · analyticLineRtp',
  };
}

/** The checks that are instant, in the order they are worth reading. */
export function runInstantChecks(): CheckResult[] {
  return [
    checkSlotDeterminism(),
    checkMotionAgreement(),
    checkLedgerSigns(),
    checkPresetCeilings(),
  ];
}

export interface ConvergenceSample {
  spins: number;
  measured: number;
  analytic: number;
}

/**
 * Runs a Monte Carlo in the browser and reports it as it goes.
 *
 * Not a decoration: it is the same `simulateSlotBatch` the server runs before
 * letting a machine be published, and watching the measured figure settle is
 * the most direct way to show why publication is gated on a simulation rather
 * than on the formula. The batches are small so the page keeps painting between
 * them.
 */
export function* convergenceRun(
  volatility: SlotVolatility,
  totalSpins: number,
  batchSize = 5_000,
): Generator<ConvergenceSample> {
  const config = slotPreset(volatility);
  const analytic = analyticLineRtp(config);
  const simulation = emptySimulation();
  const seed = `tesi-${volatility}`;

  let done = 0;
  while (done < totalSpins) {
    const size = Math.min(batchSize, totalSpins - done);
    simulateSlotBatch(config, seed, done, size, simulation, 1);
    done += size;
    yield { spins: done, measured: simulation.rtp, analytic };
  }
}

export { SLOT_RTP_MAX, SLOT_RTP_MIN };
