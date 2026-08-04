import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import type { SeatPlacement } from './hallLayout';

/**
 * A padded banquet chair, oriented so its back is away from the table.
 *
 * Geometry is intentionally coarse — six primitives — because a full hall draws
 * around forty of these and they are mostly seen from a distance.
 */
export function BingoChair({
  seat,
  fabric = '#4a3350',
  frame = '#1d1820',
  occupied = false,
  castShadow = true,
}: {
  seat: SeatPlacement;
  fabric?: string;
  frame?: string;
  occupied?: boolean;
  castShadow?: boolean;
}) {
  // The chair model faces +Z; `facing` already points at the table centre.
  const rotation = useMemo<[number, number, number]>(() => [0, seat.facing, 0], [seat.facing]);

  return (
    <group position={[seat.x, 0, seat.z]} rotation={rotation}>
      <RoundedBox
        args={[0.5, 0.09, 0.48]}
        radius={0.045}
        smoothness={2}
        position={[0, 0.45, 0]}
        castShadow={castShadow}
        receiveShadow
      >
        <meshStandardMaterial color={fabric} roughness={0.86} />
      </RoundedBox>
      <RoundedBox
        args={[0.48, 0.56, 0.1]}
        radius={0.05}
        smoothness={2}
        position={[0, 0.76, -0.21]}
        rotation={[-0.09, 0, 0]}
        castShadow={castShadow}
      >
        <meshStandardMaterial color={fabric} roughness={0.88} />
      </RoundedBox>
      <mesh position={[0, 0.22, 0]} castShadow={castShadow}>
        <cylinderGeometry args={[0.055, 0.075, 0.42, 10]} />
        <meshStandardMaterial color={frame} roughness={0.5} metalness={0.55} />
      </mesh>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <cylinderGeometry args={[0.24, 0.26, 0.04, 14]} />
        <meshStandardMaterial color={frame} roughness={0.55} metalness={0.5} />
      </mesh>
      {occupied && (
        <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.26, 0.3, 20]} />
          <meshBasicMaterial color="#f6c453" transparent opacity={0.28} />
        </mesh>
      )}
    </group>
  );
}

export default BingoChair;
