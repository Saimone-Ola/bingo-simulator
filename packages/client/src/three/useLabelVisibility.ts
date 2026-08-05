import { useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Camera, type Object3D } from 'three';
import { sweepCameraFraction } from '@bingo/shared';

/**
 * Whether the anchor projects inside the viewport, with a margin.
 *
 * A `<Html>` label has no idea it is falling off the edge of the screen, so
 * without this a sign near the border shows up sliced in half.
 */
function onScreen(world: Vector3, camera: Camera, scratch: Vector3): boolean {
  scratch.copy(world).applyMatrix4(camera.matrixWorldInverse);
  if (-scratch.z <= 0) return false;
  scratch.applyMatrix4(camera.projectionMatrix);
  return Math.abs(scratch.x) <= NDC_MARGIN && Math.abs(scratch.y) <= NDC_MARGIN;
}

/** Slightly inside the frustum edge, so a label is fully readable or absent. */
const NDC_MARGIN = 0.92;

/**
 * Whether a world-anchored DOM label should currently be shown.
 *
 * Labels in the hub are drei `<Html>`, which is real DOM layered over the
 * canvas: it cannot be depth tested, so without this every sign floats through
 * the building it belongs to and four of them pile up in the middle of the
 * screen when seen from across the plaza.
 *
 * Two rules, both cheap: hide a label the geometry would have covered, and hide
 * one that is too far away to be worth reading. The occlusion test is the same
 * analytic sweep the camera uses, so a sign is hidden by exactly the things a
 * player can see are in the way.
 */
export function useLabelVisibility(
  anchor: RefObject<Object3D | null>,
  maxDistance: number,
  options: { padding?: number; period?: number } = {},
): boolean {
  const { camera } = useThree();
  const [visible, setVisible] = useState(false);
  const nextCheck = useRef(0);
  const world = useMemo(() => new Vector3(), []);
  const ndc = useMemo(() => new Vector3(), []);
  const padding = options.padding ?? 0.1;
  // A few times a second is plenty: this drives a React re-render, and a label
  // popping a tenth of a second late is not something anyone can see.
  const period = options.period ?? 0.12;

  useFrame((state) => {
    if (state.clock.elapsedTime < nextCheck.current) return;
    nextCheck.current = state.clock.elapsedTime + period;

    const node = anchor.current;
    if (!node) return;
    node.getWorldPosition(world);

    const clear =
      camera.position.distanceTo(world) <= maxDistance &&
      onScreen(world, camera, ndc) &&
      sweepCameraFraction(
        camera.position.x,
        camera.position.y,
        camera.position.z,
        world.x,
        world.y,
        world.z,
        padding,
      ) >= 0.999;

    setVisible((current) => (current === clear ? current : clear));
  });

  return visible;
}
