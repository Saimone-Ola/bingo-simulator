import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cardViewForSeat, createViewReturnLatch, CARD_VIEW_FOV, HALL_VIEW_FOV } from '../cameraView';
import { SEATS, SEATED_EYE_HEIGHT, TABLES, TABLE_TOP_HEIGHT } from '../hallLayout';
import { layoutCards } from '../cardLayout';

describe('explicit card inspection', () => {
  it('aims at the selected physical card from every chair without changing the seat', () => {
    for (const seat of SEATS) {
      for (const card of layoutCards(6)) {
        const before = { ...seat };
        const view = cardViewForSeat(seat, SEATED_EYE_HEIGHT, card);
        const ray = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(view.pitch, view.yaw, 0, 'YXZ'));
        const target = new THREE.Vector3(view.target.x - seat.x, view.target.y - SEATED_EYE_HEIGHT, view.target.z - seat.z).normalize();
        expect(ray.dot(target)).toBeCloseTo(1, 8);
        expect(view.pitch).toBeLessThan(0);
        expect(view.target.y).toBeGreaterThan(TABLE_TOP_HEIGHT);
        const table = TABLES[seat.tableIndex]!;
        expect(Math.hypot(view.target.x - table.x, view.target.z - table.z)).toBeLessThan(table.radius);
        expect(seat).toEqual(before);
      }
    }
    expect(CARD_VIEW_FOV).toBeLessThan(HALL_VIEW_FOV);
  });

  it('keeps the original free view through card changes and returns it once', () => {
    const latch = createViewReturnLatch();
    latch.enter(1.2, 0.1);
    latch.enter(2, -0.4);
    expect(latch.leave()).toEqual({ yaw: 1.2, pitch: 0.1 });
    expect(latch.leave()).toBeNull();
  });

  it('does not restore a view belonging to a previous seat', () => {
    const latch = createViewReturnLatch();
    latch.enter(1.2, 0.1);
    latch.clear();
    expect(latch.leave()).toBeNull();
  });
});
