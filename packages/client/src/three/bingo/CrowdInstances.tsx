import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SEATED_EYE_HEIGHT, type SeatPlacement } from './hallLayout';

/**
 * The far half of the crowd, in two draw calls.
 *
 * A guest thirty metres away across a hall of five hundred is a coloured shape
 * in a chair. Drawing them as a full character costs a hierarchy of two dozen
 * meshes animated every frame; drawing them here costs one instance in a shared
 * buffer. The difference is the reason the room can be shown full at all.
 *
 * Two instanced meshes rather than one: a torso and a head, because a single
 * capsule reads as a bollard and the head is what makes a silhouette a person.
 * Colours come from the guest's own shirt and skin, so the far crowd keeps the
 * variety of the near one — a uniform grey mass looks like a bug, not a crowd.
 */

export interface InstancedGuest {
  id: string;
  seat: SeatPlacement;
  shirtColor: string;
  skinTone: string;
  /** Small per-guest offset so the far rows are not a marching grid. */
  phase: number;
}

const TORSO_HEIGHT = 0.62;
const HEAD_RADIUS = 0.15;

export default function CrowdInstances({ guests }: { guests: readonly InstancedGuest[] }) {
  const torso = useRef<THREE.InstancedMesh>(null);
  const head = useRef<THREE.InstancedMesh>(null);

  // Reused rather than allocated per guest per frame: this runs over hundreds
  // of instances and the garbage would be the expensive part.
  const scratch = useMemo(() => new THREE.Object3D(), []);
  const colour = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    if (!torso.current || !head.current) return;

    guests.forEach((guest, index) => {
      const lean = Math.sin(guest.phase * 6.28) * 0.05;

      scratch.position.set(guest.seat.x, SEATED_EYE_HEIGHT - 0.34, guest.seat.z);
      scratch.rotation.set(0, guest.seat.facing + lean, 0);
      scratch.scale.set(1, 1, 1);
      scratch.updateMatrix();
      torso.current!.setMatrixAt(index, scratch.matrix);
      torso.current!.setColorAt(index, colour.set(guest.shirtColor));

      scratch.position.y = SEATED_EYE_HEIGHT + TORSO_HEIGHT / 2 - 0.16;
      scratch.updateMatrix();
      head.current!.setMatrixAt(index, scratch.matrix);
      head.current!.setColorAt(index, colour.set(guest.skinTone));
    });

    torso.current.count = guests.length;
    head.current.count = guests.length;
    torso.current.instanceMatrix.needsUpdate = true;
    head.current.instanceMatrix.needsUpdate = true;
    if (torso.current.instanceColor) torso.current.instanceColor.needsUpdate = true;
    if (head.current.instanceColor) head.current.instanceColor.needsUpdate = true;
    // The bounding sphere is computed from the instances, so it has to be
    // recomputed or half the crowd gets frustum-culled while still on screen.
    torso.current.computeBoundingSphere();
    head.current.computeBoundingSphere();
  }, [guests, scratch, colour]);

  if (guests.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={torso}
        args={[undefined, undefined, Math.max(1, guests.length)]}
        frustumCulled={false}
      >
        <capsuleGeometry args={[0.21, TORSO_HEIGHT - 0.24, 3, 7]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh
        ref={head}
        args={[undefined, undefined, Math.max(1, guests.length)]}
        frustumCulled={false}
      >
        <sphereGeometry args={[HEAD_RADIUS, 8, 6]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
