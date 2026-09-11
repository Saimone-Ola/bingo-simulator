import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { motionForState, type MotionTargets } from '../characterMotion';
import { createHeadGeometry, createTorsoGeometry, createSmileGeometry } from '../characterGeometry';

function hand(pose: MotionTargets, side: 'left' | 'right') {
  const sign = side === 'left' ? -1 : 1;
  const lower = new THREE.Vector3(0, -0.33, 0.012).applyAxisAngle(new THREE.Vector3(1, 0, 0), pose[`${side}ElbowX`]);
  lower.y -= 0.4;
  lower.applyEuler(new THREE.Euler(pose[`${side}ArmX`], pose[`${side}ArmY`], pose[`${side}ArmZ`], 'YXZ'));
  return lower.add(new THREE.Vector3(sign * 0.255, 1.4, 0));
}

describe('character rig regressions', () => {
  it('brings the hands together at chest height during a clap and then separates them', () => {
    const closed = motionForState('APPLAUD', 0, 0, false);
    const open = motionForState('APPLAUD', 0, 1, false);
    const left = hand(closed, 'left');
    const right = hand(closed, 'right');
    expect(left.distanceTo(right)).toBeLessThan(0.09);
    expect(hand(open, 'left').distanceTo(hand(open, 'right'))).toBeGreaterThan(0.3);
    expect(left.y).toBeGreaterThan(0.95);
    expect(left.y).toBeLessThan(1.4);
    expect(left.z).toBeGreaterThan(0.3);
  });

  it('keeps a seated idle gesture separate from the deliberate zombie pose', () => {
    const idle = motionForState('SEATED_IDLE', 0, 0, true);
    const zombie = motionForState('ZOMBIE_IDLE', 0, 0, true);
    expect(hand(idle, 'left').z).toBeLessThan(hand(zombie, 'left').z);
    expect(idle.leftLegX).toBeLessThan(-1);
    expect(idle.leftKneeX).toBeGreaterThan(1);
  });

  it('produces finite normals and vertices for the sculpted meshes', () => {
    const shapes = [createHeadGeometry(), createTorsoGeometry(), createSmileGeometry(1, 0.24, false)];
    for (const shape of shapes) {
      for (const attribute of ['position', 'normal']) {
        expect([...shape.getAttribute(attribute).array].every(Number.isFinite)).toBe(true);
      }
      shape.dispose();
    }
  });
});
