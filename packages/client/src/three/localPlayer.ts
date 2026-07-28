/**
 * The locally predicted state of your own avatar.
 *
 * Lives outside React and outside the store: it is written every frame by the
 * controller and read every frame by the renderer, and nothing else should
 * ever touch it.
 *
 * This is prediction, not authority. The server owns the real position; these
 * values exist so input feels instant instead of waiting a round trip. When
 * the two disagree by more than `RECONCILE_THRESHOLD`, the server wins.
 */
export const localPlayer = {
  x: 0,
  z: 0,
  rotY: 0,
  moving: false,
  running: false,
  /** Sequence number of the last intent sent. */
  seq: 0,
  /** True once the first server snapshot has seeded the position. */
  initialised: false,
};

/**
 * How far prediction may drift before we stop believing it, in metres.
 *
 * Generous enough to absorb ordinary latency without visible correction, tight
 * enough that a modified client cannot walk through a wall and stay there:
 * the server has already resolved collisions, so any real divergence means the
 * local guess was wrong.
 */
export const RECONCILE_THRESHOLD = 0.75;

/** How quickly a detected divergence is pulled back, per second. */
export const RECONCILE_RATE = 6;

export function seedLocalPlayer(x: number, z: number, rotY: number): void {
  localPlayer.x = x;
  localPlayer.z = z;
  localPlayer.rotY = rotY;
  localPlayer.initialised = true;
}
