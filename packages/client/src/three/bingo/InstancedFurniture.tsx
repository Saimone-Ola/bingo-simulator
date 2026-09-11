import { HALL_PALETTE } from '../palette';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TABLE_RADIUS, TABLE_TOP_HEIGHT, type SeatPlacement, type TablePlacement } from './hallLayout';

/**
 * Distant tables and chairs, in four draw calls instead of seven thousand.
 *
 * This is the dominant cost in a 512-seat hall, and by a wide margin. A
 * detailed chair is ten meshes and a detailed table is thirty-six; at 512 and
 * 64 of them that is roughly 7 400 draw calls of furniture alone — several
 * times what the crowd costs even before anyone sits down.
 *
 * Beyond a few metres none of that detail survives perspective. What survives
 * is the silhouette: a disc on a pedestal, a seat with a back. So that is what
 * is drawn out there, instanced, and the detailed versions are kept for the
 * tables a player can actually reach.
 */

const CHAIR_SEAT_HEIGHT = 0.46;
const CHAIR_BACK_HEIGHT = 0.52;

export interface InstancedFurnitureProps {
  tables: readonly TablePlacement[];
  seats: readonly SeatPlacement[];
}

export default function InstancedFurniture({ tables, seats }: InstancedFurnitureProps) {
  const tops = useRef<THREE.InstancedMesh>(null);
  const pedestals = useRef<THREE.InstancedMesh>(null);
  const chairSeats = useRef<THREE.InstancedMesh>(null);
  const chairBacks = useRef<THREE.InstancedMesh>(null);

  // One scratch object reused across every instance: allocating a matrix per
  // item per update is the expensive part at these counts.
  const scratch = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const write = (
      mesh: THREE.InstancedMesh | null,
      count: number,
      place: (index: number) => void,
    ) => {
      if (!mesh) return;
      for (let index = 0; index < count; index += 1) {
        place(index);
        scratch.updateMatrix();
        mesh.setMatrixAt(index, scratch.matrix);
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      // Recomputed or half the furniture is frustum-culled while on screen.
      mesh.computeBoundingSphere();
    };

    write(tops.current, tables.length, (index) => {
      const table = tables[index]!;
      scratch.position.set(table.x, TABLE_TOP_HEIGHT, table.z);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.set(1, 1, 1);
    });

    write(pedestals.current, tables.length, (index) => {
      const table = tables[index]!;
      scratch.position.set(table.x, TABLE_TOP_HEIGHT / 2, table.z);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.set(1, 1, 1);
    });

    write(chairSeats.current, seats.length, (index) => {
      const seat = seats[index]!;
      scratch.position.set(seat.x, CHAIR_SEAT_HEIGHT, seat.z);
      scratch.rotation.set(0, seat.facing, 0);
      scratch.scale.set(1, 1, 1);
    });

    write(chairBacks.current, seats.length, (index) => {
      const seat = seats[index]!;
      // Behind the seat relative to the table, which is what `facing` faces.
      scratch.position.set(
        seat.x - Math.sin(seat.facing) * 0.22,
        CHAIR_SEAT_HEIGHT + CHAIR_BACK_HEIGHT / 2,
        seat.z - Math.cos(seat.facing) * 0.22,
      );
      scratch.rotation.set(0, seat.facing, 0);
      scratch.scale.set(1, 1, 1);
    });
  }, [tables, seats, scratch]);

  if (tables.length === 0 && seats.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={tops}
        args={[undefined, undefined, Math.max(1, tables.length)]}
        frustumCulled={false}
        receiveShadow
      >
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, 0.08, 16]} />
        <meshStandardMaterial color={HALL_PALETTE.felt} roughness={0.82} />
      </instancedMesh>

      <instancedMesh
        ref={pedestals}
        args={[undefined, undefined, Math.max(1, tables.length)]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.16, 0.34, TABLE_TOP_HEIGHT, 10]} />
        <meshStandardMaterial color={HALL_PALETTE.metal} roughness={0.7} metalness={0.3} />
      </instancedMesh>

      <instancedMesh
        ref={chairSeats}
        args={[undefined, undefined, Math.max(1, seats.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.44, 0.09, 0.44]} />
        <meshStandardMaterial color={HALL_PALETTE.upholstery} roughness={0.86} />
      </instancedMesh>

      <instancedMesh
        ref={chairBacks}
        args={[undefined, undefined, Math.max(1, seats.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.44, CHAIR_BACK_HEIGHT, 0.08]} />
        <meshStandardMaterial color={HALL_PALETTE.upholstery} roughness={0.86} />
      </instancedMesh>
    </group>
  );
}
