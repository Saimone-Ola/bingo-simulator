import { HALL_PALETTE } from '../palette';
import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { labelTexture } from './textures';
import { stableHash } from './occupants';
import { TABLE_TOP_HEIGHT, type TablePlacement } from './hallLayout';

/**
 * A round banquet table: pedestal base, circular top with a raised lip and a
 * number plate, dressed with a controlled amount of clutter.
 *
 * Props are chosen from a deterministic hash of the table so the hall looks
 * lived-in without two tables ever being identical, and without a re-render
 * shuffling the glasses around.
 */

type PropKind = 'glass' | 'bottle' | 'marker' | 'snack' | 'charm' | 'phone' | 'chips';

interface TableProp {
  readonly kind: PropKind;
  readonly angle: number;
  readonly radius: number;
  readonly tint: string;
}

const PROP_TINTS = ['#d76a5b', '#5aa9c4', '#e0b64a', '#8f6fd0', '#5fb37a'] as const;

function buildProps(seed: number, seatCount: number): readonly TableProp[] {
  const kinds: PropKind[] = ['glass', 'bottle', 'marker', 'snack', 'charm', 'phone', 'chips'];
  const count = 3 + (seed % 4);
  const props: TableProp[] = [];
  for (let index = 0; index < count; index += 1) {
    const local = seed + index * 7919;
    const kind = kinds[local % kinds.length] ?? 'glass';
    props.push({
      kind,
      // Sit props between the seats so they never land under a Bingo card.
      angle: ((local % seatCount) + 0.5) * ((Math.PI * 2) / seatCount) + Math.PI / 2,
      radius: 0.42 + ((local >> 3) % 5) * 0.06,
      tint: PROP_TINTS[(local >> 5) % PROP_TINTS.length] ?? '#d76a5b',
    });
  }
  return props;
}

function TableProp({ prop, quality }: { prop: TableProp; quality: 'LOW' | 'FULL' }) {
  const x = Math.cos(prop.angle) * prop.radius;
  const z = Math.sin(prop.angle) * prop.radius;
  const y = TABLE_TOP_HEIGHT + 0.09;

  switch (prop.kind) {
    case 'bottle':
      return (
        <group position={[x, y, z]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.032, 0.036, 0.16, quality === 'LOW' ? 6 : 10]} />
            <meshStandardMaterial color="#3f7a5c" roughness={0.28} metalness={0.05} transparent opacity={0.85} />
          </mesh>
          <mesh position={[0, 0.11, 0]}>
            <cylinderGeometry args={[0.014, 0.018, 0.06, 8]} />
            <meshStandardMaterial color="#2f5c46" roughness={0.35} />
          </mesh>
        </group>
      );
    case 'glass':
      return (
        <mesh position={[x, y + 0.02, z]} castShadow>
          <cylinderGeometry args={[0.032, 0.026, 0.1, quality === 'LOW' ? 6 : 12]} />
          <meshStandardMaterial color="#cfe6f2" roughness={0.12} metalness={0.02} transparent opacity={0.5} />
        </mesh>
      );
    case 'marker':
      return (
        <mesh position={[x, TABLE_TOP_HEIGHT + 0.055, z]} rotation={[0, prop.angle, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.011, 0.011, 0.13, 8]} />
          <meshStandardMaterial color={prop.tint} roughness={0.42} />
        </mesh>
      );
    case 'snack':
      return (
        <mesh position={[x, TABLE_TOP_HEIGHT + 0.06, z]} castShadow>
          <cylinderGeometry args={[0.075, 0.075, 0.035, quality === 'LOW' ? 6 : 14]} />
          <meshStandardMaterial color="#e6d6b4" roughness={0.7} />
        </mesh>
      );
    case 'charm':
      return (
        <mesh position={[x, TABLE_TOP_HEIGHT + 0.075, z]} rotation={[0.3, prop.angle, 0]} castShadow>
          <torusGeometry args={[0.03, 0.011, 6, 12]} />
          <meshStandardMaterial color="#d9a441" roughness={0.32} metalness={0.65} />
        </mesh>
      );
    case 'phone':
      return (
        <mesh position={[x, TABLE_TOP_HEIGHT + 0.048, z]} rotation={[-Math.PI / 2, 0, prop.angle]}>
          <boxGeometry args={[0.07, 0.14, 0.008]} />
          <meshStandardMaterial color="#1b1a22" roughness={0.3} metalness={0.3} />
        </mesh>
      );
    case 'chips':
    default:
      return (
        <group position={[x, TABLE_TOP_HEIGHT + 0.05, z]}>
          {[0, 1, 2].map((level) => (
            <mesh key={level} position={[0, level * 0.012, 0]} castShadow={level === 2}>
              <cylinderGeometry args={[0.026, 0.026, 0.012, quality === 'LOW' ? 6 : 12]} />
              <meshStandardMaterial color={level % 2 === 0 ? prop.tint : '#f3ead6'} roughness={0.55} />
            </mesh>
          ))}
        </group>
      );
  }
}

export function RoundBingoTable({
  table,
  quality = 'FULL',
  shadows = true,
  children,
}: {
  table: TablePlacement;
  quality?: 'LOW' | 'FULL';
  shadows?: boolean;
  children?: React.ReactNode;
}) {
  const seed = useMemo(() => stableHash(`table-${table.index}`), [table.index]);
  const props = useMemo(() => buildProps(seed, table.seatCount), [seed, table.seatCount]);
  const numberPlate = useMemo(
    () => labelTexture(String(table.label), { color: HALL_PALETTE.paper, fontScale: 0.72, width: 256, height: 256 }),
    [table.label],
  );
  const segments = quality === 'LOW' ? 18 : 40;

  return (
    <group position={[table.x, 0, table.z]}>
      {/* Pedestal */}
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[0.42, 0.48, 0.06, segments]} />
        <meshStandardMaterial color={HALL_PALETTE.metal} roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow={shadows}>
        <cylinderGeometry args={[0.13, 0.19, 0.7, quality === 'LOW' ? 8 : 16]} />
        <meshStandardMaterial color={HALL_PALETTE.metal} roughness={0.45} metalness={0.55} />
      </mesh>

      {/* Table top: wooden edge, felt surface, raised lip */}
      <mesh position={[0, TABLE_TOP_HEIGHT - 0.035, 0]} castShadow={shadows} receiveShadow>
        <cylinderGeometry args={[table.radius, table.radius, 0.07, segments]} />
        <meshStandardMaterial color={HALL_PALETTE.timber} roughness={0.55} metalness={0.06} />
      </mesh>
      <mesh position={[0, TABLE_TOP_HEIGHT + 0.002, 0]} receiveShadow>
        <cylinderGeometry args={[table.radius - 0.05, table.radius - 0.05, 0.012, segments]} />
        <meshStandardMaterial color={HALL_PALETTE.felt} roughness={0.94} />
      </mesh>
      <mesh position={[0, TABLE_TOP_HEIGHT + 0.012, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[table.radius - 0.024, 0.022, 6, segments]} />
        <meshStandardMaterial color={HALL_PALETTE.timberEdge} roughness={0.5} />
      </mesh>

      {/* Number plate in the middle of the table */}
      <mesh position={[0, TABLE_TOP_HEIGHT + 0.016, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.014, quality === 'LOW' ? 8 : 20]} />
        <meshStandardMaterial color="#b8892f" roughness={0.38} metalness={0.6} />
      </mesh>
      {numberPlate && (
        <mesh position={[0, TABLE_TOP_HEIGHT + 0.024, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.2, 0.2]} />
          <meshBasicMaterial map={numberPlate} transparent toneMapped={false} />
        </mesh>
      )}

      {props.map((prop, index) => (
        <TableProp key={index} prop={prop} quality={quality} />
      ))}

      {children}
    </group>
  );
}

/** A tablet standing on the table, used to buy cards without leaving the seat. */
export function TableTablet({
  position,
  rotationY,
  active,
  onActivate,
}: {
  position: [number, number, number];
  rotationY: number;
  active: boolean;
  onActivate: () => void;
}) {
  const screen = useMemo(
    () => labelTexture(active ? 'CARTELLE' : 'TAVOLO', { color: '#0a0714', background: '#f6c453', fontScale: 0.4, width: 512, height: 256 }),
    [active],
  );
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <RoundedBox
        args={[0.2, 0.14, 0.012]}
        radius={0.012}
        smoothness={2}
        rotation={[-0.5, 0, 0]}
        position={[0, 0.07, 0]}
        castShadow
        onPointerDown={(event) => {
          event.stopPropagation();
          onActivate();
        }}
      >
        <meshStandardMaterial color="#16131f" roughness={0.35} metalness={0.4} />
      </RoundedBox>
      {screen && (
        <mesh rotation={[-0.5, 0, 0]} position={[0, 0.072, 0.008]}>
          <planeGeometry args={[0.17, 0.11]} />
          <meshBasicMaterial map={screen} toneMapped={false} />
        </mesh>
      )}
      <mesh position={[0, 0.008, 0.02]}>
        <boxGeometry args={[0.14, 0.016, 0.07]} />
        <meshStandardMaterial color="#221d2c" roughness={0.5} />
      </mesh>
    </group>
  );
}

export default RoundBingoTable;
