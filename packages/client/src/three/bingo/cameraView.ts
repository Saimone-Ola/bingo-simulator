import { CARD_REST_Y, CARD_SELECTED_LIFT, DECK_RADIUS, type CardPlacement } from './cardLayout';
import { TABLES, TABLE_TOP_HEIGHT, type SeatPlacement } from './hallLayout';

export const HALL_VIEW_FOV = 62;
export const CARD_VIEW_FOV = 40;

/** Aim at the physical selected card. This never changes seat or game state. */
export function cardViewForSeat(seat: SeatPlacement, eyeHeight: number, card?: CardPlacement) {
  const table = TABLES[seat.tableIndex];
  const rotation = seat.facing + Math.PI;
  const localX = card?.x ?? 0;
  const localZ = (card?.z ?? 0) + 0.07;
  const x = (table?.x ?? 0) + Math.cos(seat.angle) * DECK_RADIUS + localX * Math.cos(rotation) + localZ * Math.sin(rotation);
  const z = (table?.z ?? 0) + Math.sin(seat.angle) * DECK_RADIUS - localX * Math.sin(rotation) + localZ * Math.cos(rotation);
  const y = TABLE_TOP_HEIGHT + 0.016 + CARD_REST_Y + CARD_SELECTED_LIFT + 0.15;
  const dx = x - seat.x;
  const dz = z - seat.z;
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.atan2(y - eyeHeight, Math.hypot(dx, dz)),
    target: { x, y, z },
  };
}

/** Snapshot updates must not overwrite a player's freely chosen view. */
export function createViewReturnLatch() {
  let previous: { yaw: number; pitch: number } | null = null;
  return {
    enter(yaw: number, pitch: number) { previous ??= { yaw, pitch }; },
    leave() { const view = previous; previous = null; return view; },
    clear() { previous = null; },
  };
}
