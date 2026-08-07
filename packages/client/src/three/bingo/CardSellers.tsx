import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AvatarAppearance } from '@bingo/shared';
import ProceduralCharacter from '../ProceduralCharacter';
import { TABLES } from './hallLayout';

/**
 * The card sellers — the *binghieri* who work the room before a round.
 *
 * In a real hall nobody queues at a desk: sellers walk the aisles with a stack
 * of cards and a satchel, table by table, asking how many you want. That is the
 * two minutes before the caller starts, and it is the part of a Bingo hall that
 * a reception desk in a corner cannot stand in for.
 *
 * They exist only while the room is selling. When the window closes they leave,
 * which is the visual half of the deadline the server enforces.
 */

const SELLER_APPEARANCES: readonly AvatarAppearance[] = [
  {
    bodyType: 'athletic',
    skinTone: '#c08a68',
    hairStyle: 'short',
    hairColor: '#241a14',
    shirtColor: '#b8323f',
    pantsColor: '#1d1b2b',
    heightCm: 176,
  },
  {
    bodyType: 'curvy',
    skinTone: '#e0b49a',
    hairStyle: 'bob',
    hairColor: '#5b3020',
    shirtColor: '#b8323f',
    pantsColor: '#1d1b2b',
    heightCm: 166,
  },
  {
    bodyType: 'slim',
    skinTone: '#8a5a3c',
    hairStyle: 'curly',
    hairColor: '#17131d',
    shirtColor: '#b8323f',
    pantsColor: '#1d1b2b',
    heightCm: 181,
  },
  {
    bodyType: 'neutral',
    skinTone: '#f0cdb4',
    hairStyle: 'long',
    hairColor: '#8d5fce',
    shirtColor: '#b8323f',
    pantsColor: '#1d1b2b',
    heightCm: 171,
  },
];

/**
 * The aisles they walk.
 *
 * Derived from the table grid rather than typed in: a seller on a hardcoded
 * path walks through the furniture the moment the hall is resized, which is
 * exactly what happened to the waiter's route. Each aisle sits midway between
 * two columns of tables, so a seller is always within reach of the players on
 * both sides of them.
 */
function sellerAisles(): readonly number[] {
  const columns = [...new Set(TABLES.map((table) => table.x))].sort((a, b) => a - b);
  const aisles: number[] = [];
  for (let index = 0; index + 1 < columns.length; index += 1) {
    aisles.push((columns[index]! + columns[index + 1]!) / 2);
  }
  // Every other aisle: four sellers covering the room, not one per gap.
  return aisles.filter((_value, index) => index % 2 === 1);
}

/** A tray of cards, held at the hip. */
function CardTray() {
  return (
    <group position={[0.3, 1.04, 0.14]} rotation={[0, 0, -0.14]}>
      <mesh castShadow>
        <boxGeometry args={[0.3, 0.03, 0.22]} />
        <meshStandardMaterial color="#3a2a44" roughness={0.7} />
      </mesh>
      {[0.035, 0.062, 0.089].map((height, index) => (
        <mesh key={height} position={[0, height, index % 2 === 0 ? 0.008 : -0.008]}>
          <boxGeometry args={[0.26, 0.022, 0.18]} />
          <meshStandardMaterial color={index === 2 ? '#f4efe2' : '#e8e0cd'} roughness={0.92} />
        </mesh>
      ))}
    </group>
  );
}

function Seller({
  aisleX,
  minZ,
  maxZ,
  phase,
  appearance,
  reducedMotion,
}: {
  aisleX: number;
  minZ: number;
  maxZ: number;
  phase: number;
  appearance: AvatarAppearance;
  reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const progress = useRef(phase);
  const pausing = useRef(false);

  useFrame((_state, delta) => {
    const node = group.current;
    if (!node) return;
    if (reducedMotion) {
      node.position.set(aisleX, 0, minZ + (maxZ - minZ) * phase);
      return;
    }

    // Slow, with a pause at each table: a seller who glides the length of the
    // hall at constant speed reads as a patrol, not as someone taking orders.
    const cycle = (progress.current + delta * 0.035) % 1;
    progress.current = cycle;
    const sweep = cycle < 0.5 ? cycle * 2 : 2 - cycle * 2;
    const dwell = Math.sin(sweep * Math.PI * 8);
    pausing.current = dwell > 0.86;

    const z = minZ + (maxZ - minZ) * sweep;
    node.position.set(aisleX, 0, z);
    node.rotation.y = cycle < 0.5 ? 0 : Math.PI;
  });

  return (
    <group ref={group} position={[aisleX, 0, minZ]}>
      <ProceduralCharacter
        appearance={appearance}
        state={reducedMotion ? 'IDLE' : 'WALK'}
        personality="CALM"
        position={[0, 0, 0]}
        rotationY={0}
        scale={0.98}
        phase={phase}
        reducedMotion={reducedMotion}
      />
      <CardTray />
    </group>
  );
}

export default function CardSellers({ reducedMotion }: { reducedMotion: boolean }) {
  const aisles = useMemo(sellerAisles, []);
  const depth = useMemo(() => {
    const zs = TABLES.map((table) => table.z);
    return { minZ: Math.min(...zs) - 2.4, maxZ: Math.max(...zs) + 2.4 };
  }, []);

  return (
    <group>
      {aisles.map((aisleX, index) => (
        <Seller
          key={aisleX}
          aisleX={aisleX}
          minZ={depth.minZ}
          maxZ={depth.maxZ}
          phase={(index * 0.37) % 1}
          appearance={SELLER_APPEARANCES[index % SELLER_APPEARANCES.length]!}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  );
}
