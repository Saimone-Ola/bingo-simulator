/**
 * Which guests get drawn properly, and which get drawn cheaply.
 *
 * Five hundred articulated characters is not a frame budget any laptop has: the
 * hall has 512 seats, each character is a two dozen mesh hierarchy driven every
 * frame, and drawing them all would cost more than the rest of the room put
 * together.
 *
 * So the crowd is split by distance into three tiers. The nearest few dozen are
 * full characters, because those are the ones a player looks at. Beyond that a
 * guest becomes a simple seated silhouette with no animation. Beyond *that* it
 * becomes one instance in a single draw call — still a person in a chair from
 * across the room, but costing almost nothing.
 *
 * The selection is a pure function of positions, so the tiering can be asserted
 * rather than judged by frame rate on one machine.
 */

import { DETAILED_GUEST_BUDGET } from '@bingo/shared';

export interface CrowdCandidate {
  id: string;
  x: number;
  z: number;
}

export const CROWD_TIERS = ['FULL', 'SIMPLE', 'INSTANCED'] as const;
export type CrowdTier = (typeof CROWD_TIERS)[number];

/**
 * Where the tiers change over, in metres.
 *
 * Chosen against the table pitch rather than picked out of the air: the full
 * radius covers your own table and its immediate neighbours, which is everyone
 * you could plausibly be looking at while seated.
 */
export const FULL_RADIUS = 9;
export const SIMPLE_RADIUS = 22;

export interface CrowdSelection {
  full: CrowdCandidate[];
  simple: CrowdCandidate[];
  instanced: CrowdCandidate[];
}

export interface CrowdBudget {
  /** Hard cap on full characters, whatever the distances say. */
  fullBudget?: number;
  /** Hard cap on simple ones. */
  simpleBudget?: number;
}

function distanceSq(candidate: CrowdCandidate, x: number, z: number): number {
  const dx = candidate.x - x;
  const dz = candidate.z - z;
  return dx * dx + dz * dz;
}

/**
 * Splits the crowd into tiers around the viewer.
 *
 * The budget is a *cap*, not a target: standing alone in a corner should not
 * promote thirty distant guests to full detail just because there is room in
 * the budget. Distance decides the tier, and the budget only ever demotes.
 */
export function selectCrowdTiers(
  candidates: readonly CrowdCandidate[],
  viewerX: number,
  viewerZ: number,
  budget: CrowdBudget = {},
): CrowdSelection {
  const fullBudget = Math.max(0, budget.fullBudget ?? DETAILED_GUEST_BUDGET);
  const simpleBudget = Math.max(0, budget.simpleBudget ?? DETAILED_GUEST_BUDGET * 4);

  const sorted = [...candidates].sort(
    (a, b) => distanceSq(a, viewerX, viewerZ) - distanceSq(b, viewerX, viewerZ),
  );

  const full: CrowdCandidate[] = [];
  const simple: CrowdCandidate[] = [];
  const instanced: CrowdCandidate[] = [];

  const fullSq = FULL_RADIUS * FULL_RADIUS;
  const simpleSq = SIMPLE_RADIUS * SIMPLE_RADIUS;

  for (const candidate of sorted) {
    const d = distanceSq(candidate, viewerX, viewerZ);
    if (d <= fullSq && full.length < fullBudget) full.push(candidate);
    else if (d <= simpleSq && simple.length < simpleBudget) simple.push(candidate);
    else instanced.push(candidate);
  }

  return { full, simple, instanced };
}

/**
 * Budgets for each graphics setting.
 *
 * The lowest tier draws nobody at full detail. That is deliberate: a machine
 * that cannot hold the frame rate is better served by a room that is visibly
 * full of simple people than by eight good ones and a slideshow.
 */
export const CROWD_BUDGETS: Record<string, CrowdBudget> = {
  LOW: { fullBudget: 0, simpleBudget: 24 },
  MEDIUM: { fullBudget: 10, simpleBudget: 60 },
  HIGH: { fullBudget: DETAILED_GUEST_BUDGET, simpleBudget: 120 },
  ULTRA: { fullBudget: 44, simpleBudget: 200 },
};

export function budgetFor(quality: string): CrowdBudget {
  return CROWD_BUDGETS[quality] ?? CROWD_BUDGETS.MEDIUM!;
}
