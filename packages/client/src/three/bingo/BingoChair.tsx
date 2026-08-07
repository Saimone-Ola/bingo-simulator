import { useEffect, useMemo, useState } from 'react';
import { RoundedBox } from '@react-three/drei';
import type { SeatPlacement } from './hallLayout';

/**
 * A padded banquet chair, oriented so its back is away from the table.
 *
 * Geometry is intentionally coarse — six primitives — because a full hall draws
 * around forty of these and they are mostly seen from a distance.
 *
 * A free chair can be clicked to sit in it. Walking up and pressing E works
 * too, but pointing at the chair you want is the thing people try first, and
 * before this the only way to choose a specific seat was the overhead map.
 */
export function BingoChair({
  seat,
  fabric = '#4a3350',
  frame = '#1d1820',
  occupied = false,
  castShadow = true,
  selectable = false,
  onSit,
}: {
  seat: SeatPlacement;
  fabric?: string;
  frame?: string;
  occupied?: boolean;
  castShadow?: boolean;
  /** Free, and near enough that clicking it should seat the player. */
  selectable?: boolean;
  onSit?: (seatId: string) => void;
}) {
  // The chair model faces +Z; `facing` already points at the table centre.
  const rotation = useMemo<[number, number, number]>(() => [0, seat.facing, 0], [seat.facing]);
  const [hovered, setHovered] = useState(false);

  const interactive = selectable && onSit !== undefined;
  // Hover state has to be dropped when the chair stops being selectable, or a
  // chair someone just sat in keeps glowing under the cursor.
  const lit = interactive && hovered;

  /**
   * Give the cursor back.
   *
   * Chairs are mounted and unmounted as the player walks: the level of detail
   * swaps a detailed chair for an instanced one past twelve metres. Walking
   * away from a chair the pointer happens to be over unmounts it mid-hover, and
   * without this the page keeps a pointer cursor for the rest of the session
   * with nothing under it to explain why. The same goes for a chair someone
   * else sits in while the pointer is on it.
   */
  useEffect(() => {
    if (interactive) return;
    setHovered(false);
    document.body.style.cursor = '';
  }, [interactive]);

  useEffect(
    () => () => {
      document.body.style.cursor = '';
    },
    [],
  );

  return (
    <group
      position={[seat.x, 0, seat.z]}
      rotation={rotation}
      onPointerOver={(event) => {
        if (!interactive) return;
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        setHovered(false);
        document.body.style.cursor = '';
      }}
      onClick={(event) => {
        if (!interactive) return;
        event.stopPropagation();
        document.body.style.cursor = '';
        onSit(seat.id);
      }}
    >
      <RoundedBox
        args={[0.5, 0.09, 0.48]}
        radius={0.045}
        smoothness={2}
        position={[0, 0.45, 0]}
        castShadow={castShadow}
        receiveShadow
      >
        <meshStandardMaterial
          color={lit ? '#5f4268' : fabric}
          emissive={lit ? '#8ee8de' : '#000000'}
          emissiveIntensity={lit ? 0.22 : 0}
          roughness={0.86}
        />
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
      {/*
        Marker on a free chair within reach.

        Visible before the pointer is over it, or nobody discovers that chairs
        can be clicked at all — and a *different shape* from the gold ring on an
        occupied chair rather than the same ring in another colour. Colour alone
        is never allowed to carry the distinction.
      */}
      {interactive && (
        <mesh position={[0, lit ? 1.3 : 1.22, 0]} rotation={[Math.PI, Math.PI / 4, 0]}>
          <coneGeometry args={[lit ? 0.13 : 0.1, lit ? 0.2 : 0.16, 4]} />
          <meshBasicMaterial color="#8ee8de" transparent opacity={lit ? 0.95 : 0.5} />
        </mesh>
      )}
    </group>
  );
}

export default BingoChair;
