import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  LABEL_MAX_DISTANCE,
  LABEL_MIN_VIEW_DEPTH,
  LABEL_SCREEN_MARGIN,
  isNameTagVisible,
  writeLabelAnchor,
  type LabelAnchor,
} from '../labels';

/**
 * Name tag placement.
 *
 * The bug these pin down: the old code decided visibility from the projected
 * `z`, which does not distinguish "in front of the camera" from "behind it".
 * A third-person camera that drifts into its own avatar then pinned the
 * player's name across the middle of the screen.
 */

const WIDTH = 1280;
const HEIGHT = 720;

/** A camera at the origin looking down -Z, the way three.js starts one. */
function cameraLookingForward(): PerspectiveCamera {
  const camera = new PerspectiveCamera(60, WIDTH / HEIGHT, 0.1, 200);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

function anchor(): LabelAnchor {
  return { x: -1, y: -1, visible: false, distance: 0 };
}

function place(
  camera: PerspectiveCamera,
  point: Vector3,
  distance: number,
  occluded = false,
): LabelAnchor {
  return writeLabelAnchor(
    anchor(),
    camera,
    point,
    WIDTH,
    HEIGHT,
    distance,
    occluded,
    new Vector3(),
  );
}

describe('writeLabelAnchor', () => {
  it('places a player straight ahead in the middle of the screen', () => {
    const result = place(cameraLookingForward(), new Vector3(0, 0, -8), 8);
    expect(result.visible).toBe(true);
    expect(result.x).toBeCloseTo(WIDTH / 2, 0);
    expect(result.y).toBeCloseTo(HEIGHT / 2, 0);
  });

  it('hides a player standing behind the camera', () => {
    // The regression: this point projects back onto the screen, mirrored.
    const result = place(cameraLookingForward(), new Vector3(0, 0, 6), 6);
    expect(result.visible).toBe(false);
  });

  it('hides a player half a metre away, inside the camera', () => {
    const result = place(cameraLookingForward(), new Vector3(0, 0, -0.5), 0.5);
    expect(result.visible).toBe(false);
  });

  it('starts showing a label exactly at the minimum view depth', () => {
    const camera = cameraLookingForward();
    const justInside = place(camera, new Vector3(0, 0, -(LABEL_MIN_VIEW_DEPTH + 0.01)), 2);
    const justOutside = place(camera, new Vector3(0, 0, -(LABEL_MIN_VIEW_DEPTH - 0.01)), 2);
    expect(justInside.visible).toBe(true);
    expect(justOutside.visible).toBe(false);
  });

  it('hides a player standing beyond the readable distance', () => {
    const result = place(
      cameraLookingForward(),
      new Vector3(0, 0, -(LABEL_MAX_DISTANCE + 1)),
      LABEL_MAX_DISTANCE + 1,
    );
    expect(result.visible).toBe(false);
  });

  it('hides a player behind a wall', () => {
    const result = place(cameraLookingForward(), new Vector3(0, 0, -8), 8, true);
    expect(result.visible).toBe(false);
  });

  it('keeps a label fully on screen instead of letting it hang off the edge', () => {
    // Far to the left but still in front: the projection lands off screen.
    const result = place(cameraLookingForward(), new Vector3(-40, 0, -3), 40.1);
    if (!result.visible) return;
    expect(result.x).toBeGreaterThanOrEqual(LABEL_SCREEN_MARGIN);
    expect(result.x).toBeLessThanOrEqual(WIDTH - LABEL_SCREEN_MARGIN);
    expect(result.y).toBeGreaterThanOrEqual(LABEL_SCREEN_MARGIN);
    expect(result.y).toBeLessThanOrEqual(HEIGHT - LABEL_SCREEN_MARGIN);
  });

  it('follows the camera when it turns around', () => {
    const camera = new PerspectiveCamera(60, WIDTH / HEIGHT, 0.1, 200);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, 1);
    camera.updateMatrixWorld(true);

    // Now +Z is in front and -Z is behind: the two cases swap over.
    expect(place(camera, new Vector3(0, 0, 8), 8).visible).toBe(true);
    expect(place(camera, new Vector3(0, 0, -8), 8).visible).toBe(false);
  });

  it('always records the distance, even when it hides the label', () => {
    const result = place(cameraLookingForward(), new Vector3(0, 0, 6), 6);
    expect(result.visible).toBe(false);
    expect(result.distance).toBe(6);
  });

  it('writes into the object the caller owns, allocating nothing', () => {
    const target = anchor();
    const result = writeLabelAnchor(
      target,
      cameraLookingForward(),
      new Vector3(0, 0, -8),
      WIDTH,
      HEIGHT,
      8,
      false,
      new Vector3(),
    );
    expect(result).toBe(target);
  });
});

describe('isNameTagVisible', () => {
  it('never shows the local player their own name tag', () => {
    const visible: LabelAnchor = { x: 10, y: 10, visible: true, distance: 4 };
    expect(isNameTagVisible(visible, true)).toBe(false);
    expect(isNameTagVisible(visible, false)).toBe(true);
  });

  it('hides a tag whose anchor is not on screen', () => {
    expect(isNameTagVisible({ x: 0, y: 0, visible: false, distance: 4 }, false)).toBe(false);
  });

  it('hides a tag for a player with no anchor yet', () => {
    expect(isNameTagVisible(undefined, false)).toBe(false);
  });
});
