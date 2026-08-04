/**
 * Screen-space anchors for the name tags and chat bubbles that float over
 * avatars.
 *
 * The alternative - drei's <Html> per avatar - creates a DOM node and a
 * transform update per player per frame, inside the render loop. Instead one
 * component inside the canvas projects every avatar in a single pass and
 * writes here; one component outside the canvas reads it on an animation
 * frame and moves the nodes. React renders neither.
 */
import type { Camera, Vector3 } from 'three';

export interface LabelAnchor {
  x: number;
  y: number;
  visible: boolean;
  distance: number;
}

export const labelAnchors = new Map<string, LabelAnchor>();

/** Beyond this many metres a name tag is noise, not information. */
export const LABEL_MAX_DISTANCE = 22;

/**
 * How far in front of the camera an anchor has to be to earn a label.
 *
 * Testing the projected `z` instead is the trap: it does not reject points
 * *behind* the camera, which project back onto the screen mirrored, so an
 * avatar the third-person camera has moved into ends up with its name pinned
 * across the middle of the view. Depth in camera space has no such ambiguity.
 */
export const LABEL_MIN_VIEW_DEPTH = 1.2;

/** Keeps a label fully on screen instead of letting it hang half cut off. */
export const LABEL_SCREEN_MARGIN = 14;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Positions one label, writing into `target` rather than returning a new object:
 * this runs for every visible player every frame.
 *
 * `scratch` is a caller-owned vector, reused for the same reason.
 */
export function writeLabelAnchor(
  target: LabelAnchor,
  camera: Camera,
  point: Vector3,
  viewportWidth: number,
  viewportHeight: number,
  distance: number,
  occluded: boolean,
  scratch: Vector3,
): LabelAnchor {
  target.distance = distance;

  if (occluded || distance >= LABEL_MAX_DISTANCE) {
    target.visible = false;
    return target;
  }

  // Camera space first: the camera looks down its own -Z, so a point in front
  // of it has a negative z and a positive depth.
  scratch.copy(point).applyMatrix4(camera.matrixWorldInverse);
  const depth = -scratch.z;
  if (!Number.isFinite(depth) || depth < LABEL_MIN_VIEW_DEPTH) {
    target.visible = false;
    return target;
  }

  scratch.applyMatrix4(camera.projectionMatrix);
  target.x = clamp(
    (scratch.x * 0.5 + 0.5) * viewportWidth,
    LABEL_SCREEN_MARGIN,
    viewportWidth - LABEL_SCREEN_MARGIN,
  );
  target.y = clamp(
    (-scratch.y * 0.5 + 0.5) * viewportHeight,
    LABEL_SCREEN_MARGIN,
    viewportHeight - LABEL_SCREEN_MARGIN,
  );
  target.visible = true;
  return target;
}

/**
 * Whether a player's name tag should be drawn at all.
 *
 * The local player never sees their own: the yellow ring on the floor already
 * says which avatar is theirs, and in third person the tag sits exactly where
 * they are trying to look. Their anchor is still computed, because the chat
 * bubble above their head rides on it.
 */
export function isNameTagVisible(anchor: LabelAnchor | undefined, isSelf: boolean): boolean {
  if (isSelf) return false;
  return anchor?.visible === true;
}

/** Chat bubbles currently floating above heads, keyed by session id. */
export const chatBubbles = new Map<string, { text: string; until: number }>();

export const BUBBLE_DURATION_MS = 5_000;

export function showBubble(sessionId: string, text: string): void {
  chatBubbles.set(sessionId, { text, until: Date.now() + BUBBLE_DURATION_MS });
}
