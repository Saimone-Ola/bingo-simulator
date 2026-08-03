import { useMemo, useRef } from 'react';
import { Html, Sky, Sparkles } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { HUB_BOUNDS, HUB_OBSTACLES, HUB_POIS } from '@bingo/shared';

const COLORS = {
  ground: '#8272d8',
  groundDark: '#5648a3',
  plaza: '#a99bed',
  path: '#d7d0ff',
  white: '#fffaff',
  violet: '#714ee8',
  violetDark: '#3b258e',
  cyan: '#33d3e5',
  cyanDark: '#087f99',
  pink: '#ff5ca8',
  coral: '#ff7d73',
  gold: '#ffc84a',
  goldDark: '#b86e00',
  green: '#54d88d',
  foliage: '#2ba66b',
  trunk: '#7b4d42',
  water: '#56e3ff',
} as const;

function Ground() {
  const width = HUB_BOUNDS.maxX - HUB_BOUNDS.minX;
  const depth = HUB_BOUNDS.maxZ - HUB_BOUNDS.minZ;
  const pathLength = 27;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={COLORS.groundDark} roughness={0.9} />
      </mesh>

      <mesh position={[0, -0.02, 0]} receiveShadow>
        <cylinderGeometry args={[17.5, 18.2, 0.24, 64]} />
        <meshStandardMaterial color={COLORS.plaza} roughness={0.78} />
      </mesh>

      <mesh position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[12.8, 13.1, 0.12, 64]} />
        <meshStandardMaterial color="#7765cb" roughness={0.78} />
      </mesh>

      {/* Four pale paths make the destinations readable at a glance. */}
      <mesh position={[0, 0.04, -17]} receiveShadow>
        <boxGeometry args={[6, 0.1, pathLength]} />
        <meshStandardMaterial color={COLORS.path} roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.04, 17]} receiveShadow>
        <boxGeometry args={[6, 0.1, pathLength]} />
        <meshStandardMaterial color={COLORS.path} roughness={0.82} />
      </mesh>
      <mesh position={[17, 0.04, 0]} receiveShadow>
        <boxGeometry args={[pathLength, 0.1, 6]} />
        <meshStandardMaterial color={COLORS.path} roughness={0.82} />
      </mesh>
      <mesh position={[-17, 0.04, 0]} receiveShadow>
        <boxGeometry args={[pathLength, 0.1, 6]} />
        <meshStandardMaterial color={COLORS.path} roughness={0.82} />
      </mesh>

      {/* Decorative rings add scale without visual clutter. */}
      {[10.5, 16.2].map((radius) => (
        <mesh key={radius} position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius, radius + 0.16, 96]} />
          <meshBasicMaterial color="#c8bdff" transparent opacity={0.42} />
        </mesh>
      ))}
    </group>
  );
}

function Perimeter() {
  const width = HUB_BOUNDS.maxX - HUB_BOUNDS.minX;
  const depth = HUB_BOUNDS.maxZ - HUB_BOUNDS.minZ;
  const walls: [number, number, number, number][] = [
    [0, HUB_BOUNDS.minZ, width, 0.5],
    [0, HUB_BOUNDS.maxZ, width, 0.5],
    [HUB_BOUNDS.minX, 0, 0.5, depth],
    [HUB_BOUNDS.maxX, 0, 0.5, depth],
  ];

  return (
    <group>
      {walls.map(([x, z, sx, sz], index) => (
        <mesh key={index} position={[x, 0.45, z]} castShadow receiveShadow>
          <boxGeometry args={[sx, 0.9, sz]} />
          <meshStandardMaterial color="#4a3d90" roughness={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function WorldSign({
  position,
  title,
  subtitle,
  color,
}: {
  position: [number, number, number];
  title: string;
  subtitle: string;
  color: string;
}) {
  return (
    <Html position={position} center distanceFactor={13} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div className="world-sign" style={{ borderColor: color, boxShadow: `0 12px 34px -16px ${color}` }}>
        <span className="world-sign-dot" style={{ background: color, boxShadow: `0 0 14px ${color}` }} />
        <div>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </div>
      </div>
    </Html>
  );
}

function Entrance({
  position,
  color,
  width = 3.2,
  height = 3.2,
}: {
  position: [number, number, number];
  color: string;
  width?: number;
  height?: number;
}) {
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[width, height, 0.5]} />
        <meshStandardMaterial color="#171032" roughness={0.48} />
      </mesh>
      <mesh position={[0, 0, 0.27]}>
        <planeGeometry args={[width * 0.66, height * 0.78]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} />
      </mesh>
      <pointLight position={[0, 0.4, 1.5]} color={color} intensity={16} distance={8} />
    </group>
  );
}

function BingoHall() {
  return (
    <group position={[0, 0, -20]}>
      <mesh position={[0, 2.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[18, 4.5, 6]} />
        <meshStandardMaterial color={COLORS.violet} roughness={0.5} />
      </mesh>
      <mesh position={[0, 4.75, 0]} castShadow>
        <boxGeometry args={[19.2, 0.55, 6.8]} />
        <meshStandardMaterial color={COLORS.violetDark} roughness={0.45} />
      </mesh>
      <Entrance position={[0, 1.75, 3.12]} color={COLORS.gold} width={4.2} height={3.5} />

      {[-7, -4.8, 4.8, 7].map((x) => (
        <group key={x} position={[x, 0, 3.2]}>
          <mesh position={[0, 2.1, 0]} castShadow>
            <cylinderGeometry args={[0.28, 0.34, 4.2, 12]} />
            <meshStandardMaterial color={COLORS.white} roughness={0.5} />
          </mesh>
          <mesh position={[0, 4.28, 0]}>
            <sphereGeometry args={[0.44, 12, 10]} />
            <meshStandardMaterial color={COLORS.gold} emissive={COLORS.gold} emissiveIntensity={0.35} />
          </mesh>
        </group>
      ))}

      {/* Oversized bingo balls make the building recognisable even from spawn. */}
      {[
        [-3, 5.45, 0, '#ff6687'],
        [0, 5.75, 0, COLORS.gold],
        [3, 5.45, 0, COLORS.cyan],
      ].map(([x, y, z, color], index) => (
        <mesh key={index} position={[Number(x), Number(y), Number(z)]} castShadow>
          <sphereGeometry args={[0.82, 20, 16]} />
          <meshStandardMaterial color={String(color)} roughness={0.28} metalness={0.08} />
        </mesh>
      ))}

      <WorldSign
        position={[0, 6.6, 3.2]}
        title="SALA BINGO"
        subtitle="Partite multiplayer · Prossimamente"
        color={COLORS.gold}
      />
    </group>
  );
}

function SlotArcade() {
  return (
    <group position={[20, 0, 0]}>
      <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[6, 5, 16]} />
        <meshStandardMaterial color={COLORS.cyanDark} roughness={0.48} />
      </mesh>
      <mesh position={[0, 5.25, 0]} castShadow>
        <boxGeometry args={[6.7, 0.55, 16.7]} />
        <meshStandardMaterial color={COLORS.cyan} emissive={COLORS.cyan} emissiveIntensity={0.16} />
      </mesh>
      <Entrance position={[-3.12, 1.8, 0]} color={COLORS.pink} width={0.5} height={3.6} />

      {[-5.5, -2, 2, 5.5].map((z, index) => (
        <group key={z} position={[-3.14, 2.7, z]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh>
            <planeGeometry args={[2.3, 2.1]} />
            <meshStandardMaterial
              color={index % 2 ? COLORS.gold : COLORS.pink}
              emissive={index % 2 ? COLORS.gold : COLORS.pink}
              emissiveIntensity={0.38}
            />
          </mesh>
          <mesh position={[0, -0.88, 0.05]}>
            <boxGeometry args={[1.7, 0.18, 0.1]} />
            <meshStandardMaterial color={COLORS.white} />
          </mesh>
        </group>
      ))}

      <WorldSign
        position={[-3.7, 6.4, 0]}
        title="ARCADE SLOT"
        subtitle="Minigiochi della community"
        color={COLORS.cyan}
      />
    </group>
  );
}

function PrizePavilion() {
  return (
    <group position={[-20, 0, 2]}>
      <mesh position={[0, 2.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[6, 4.3, 12]} />
        <meshStandardMaterial color={COLORS.goldDark} roughness={0.52} />
      </mesh>
      <mesh position={[0, 4.55, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
        <boxGeometry args={[4.8, 4.8, 12.8]} />
        <meshStandardMaterial color={COLORS.gold} roughness={0.4} />
      </mesh>
      <mesh position={[0, 4.6, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[3.9, 3.9, 13]} />
        <meshStandardMaterial color="#ff8f57" roughness={0.45} />
      </mesh>
      <Entrance position={[3.12, 1.7, 0]} color={COLORS.gold} width={0.5} height={3.4} />

      <mesh position={[3.55, 4.1, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <torusGeometry args={[1.15, 0.28, 12, 32]} />
        <meshStandardMaterial color={COLORS.white} emissive={COLORS.gold} emissiveIntensity={0.45} />
      </mesh>
      <WorldSign
        position={[3.8, 6.5, 0]}
        title="PADIGLIONE PREMI"
        subtitle="Colleziona ricompense virtuali"
        color={COLORS.gold}
      />
    </group>
  );
}

function Shop() {
  return (
    <group position={[6, 0, 19]}>
      <mesh position={[0, 2.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[10, 4.2, 6]} />
        <meshStandardMaterial color={COLORS.coral} roughness={0.58} />
      </mesh>
      <mesh position={[0, 4.55, 0]} castShadow>
        <boxGeometry args={[10.8, 0.7, 6.8]} />
        <meshStandardMaterial color="#9f3b69" roughness={0.45} />
      </mesh>
      <Entrance position={[0, 1.7, -3.12]} color={COLORS.pink} width={3.4} height={3.4} />

      {[-3.7, 3.7].map((x) => (
        <group key={x} position={[x, 2.15, -3.14]}>
          <mesh>
            <planeGeometry args={[2.3, 2.3]} />
            <meshStandardMaterial color="#ffcae5" emissive={COLORS.pink} emissiveIntensity={0.2} />
          </mesh>
          <mesh position={[0, -1.35, 0.1]}>
            <boxGeometry args={[2.8, 0.3, 0.35]} />
            <meshStandardMaterial color={COLORS.white} />
          </mesh>
        </group>
      ))}

      <WorldSign
        position={[0, 6.1, -3.4]}
        title="BINGO SHOP"
        subtitle="Look, accessori e personalizzazioni"
        color={COLORS.pink}
      />
    </group>
  );
}

function Fountain() {
  const water = useRef<Group>(null);

  useFrame((state) => {
    if (!water.current) return;
    water.current.rotation.y = state.clock.elapsedTime * 0.22;
    water.current.position.y = Math.sin(state.clock.elapsedTime * 1.8) * 0.035;
  });

  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[3.2, 3.5, 0.76, 48]} />
        <meshStandardMaterial color={COLORS.white} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[2.75, 2.9, 0.18, 48]} />
        <meshPhysicalMaterial
          color={COLORS.water}
          emissive={COLORS.cyan}
          emissiveIntensity={0.32}
          roughness={0.12}
          metalness={0.06}
          transparent
          opacity={0.9}
        />
      </mesh>
      <mesh position={[0, 1.45, 0]} castShadow>
        <cylinderGeometry args={[0.38, 0.72, 1.45, 20]} />
        <meshStandardMaterial color={COLORS.white} roughness={0.42} />
      </mesh>

      <group ref={water} position={[0, 2.2, 0]}>
        <mesh>
          <sphereGeometry args={[0.42, 18, 14]} />
          <meshStandardMaterial color={COLORS.water} emissive={COLORS.water} emissiveIntensity={0.65} />
        </mesh>
        {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((rotation) => (
          <mesh key={rotation} rotation={[0, rotation, Math.PI / 2]} position={[Math.cos(rotation) * 0.75, -0.25, Math.sin(rotation) * 0.75]}>
            <torusGeometry args={[0.78, 0.065, 8, 28, Math.PI]} />
            <meshStandardMaterial
              color={COLORS.water}
              emissive={COLORS.water}
              emissiveIntensity={0.7}
              transparent
              opacity={0.82}
            />
          </mesh>
        ))}
      </group>

      <pointLight position={[0, 2.4, 0]} color={COLORS.water} intensity={28} distance={12} />
      <WorldSign
        position={[0, 4.4, 0]}
        title="PIAZZA CENTRALE"
        subtitle="Benvenuto nel mondo di Bingo Simulator"
        color={COLORS.cyan}
      />
    </group>
  );
}

function Planters() {
  const planters = HUB_OBSTACLES.filter(
    (obstacle) => obstacle.kind === 'circle' && obstacle.radius <= 2.5,
  );

  return (
    <group>
      {planters.map((obstacle, index) => {
        if (obstacle.kind !== 'circle') return null;
        return (
          <group key={index} position={[obstacle.x, 0, obstacle.z]}>
            <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[obstacle.radius, obstacle.radius * 1.12, 0.84, 24]} />
              <meshStandardMaterial color="#f0eaff" roughness={0.66} />
            </mesh>
            <mesh position={[0, 0.84, 0]}>
              <cylinderGeometry args={[obstacle.radius * 0.82, obstacle.radius * 0.82, 0.16, 24]} />
              <meshStandardMaterial color="#382867" roughness={1} />
            </mesh>
            <mesh position={[0, 1.85, 0]} castShadow>
              <cylinderGeometry args={[0.16, 0.22, 2, 10]} />
              <meshStandardMaterial color={COLORS.trunk} roughness={0.9} />
            </mesh>
            {[
              [0, 3, 0],
              [0.65, 2.65, 0.15],
              [-0.6, 2.7, -0.2],
              [0.1, 2.65, 0.65],
            ].map(([x, y, z], leafIndex) => (
              <mesh key={leafIndex} position={[x, y, z]} castShadow>
                <sphereGeometry args={[0.72, 12, 10]} />
                <meshStandardMaterial
                  color={leafIndex % 2 ? COLORS.green : COLORS.foliage}
                  roughness={0.76}
                />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function Lamps() {
  const positions: [number, number][] = [
    [-7, -8],
    [7, -8],
    [-7, 8],
    [7, 8],
    [-13, 0],
    [13, 0],
  ];

  return (
    <group>
      {positions.map(([x, z], index) => (
        <group key={index} position={[x, 0, z]}>
          <mesh position={[0, 1.8, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.12, 3.6, 10]} />
            <meshStandardMaterial color="#362b6f" roughness={0.45} metalness={0.3} />
          </mesh>
          <mesh position={[0, 3.7, 0]}>
            <sphereGeometry args={[0.3, 14, 12]} />
            <meshStandardMaterial color={COLORS.gold} emissive={COLORS.gold} emissiveIntensity={1.1} />
          </mesh>
          {index % 2 === 0 && (
            <pointLight position={[0, 3.7, 0]} color={COLORS.gold} intensity={10} distance={8} />
          )}
        </group>
      ))}
    </group>
  );
}

function PointsOfInterest({ currentPhase }: { currentPhase: number }) {
  const pads = useMemo(
    () =>
      HUB_POIS.map((poi) => ({
        ...poi,
        unlocked: poi.availableFromPhase <= currentPhase,
      })),
    [currentPhase],
  );

  return (
    <group>
      {pads.map((poi) => (
        <group key={poi.id} position={[poi.standX, 0.16, poi.standZ]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[1.55, 36]} />
            <meshBasicMaterial
              color={poi.unlocked ? COLORS.gold : '#7d72b8'}
              transparent
              opacity={poi.unlocked ? 0.3 : 0.17}
            />
          </mesh>
          <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.08, 1.52, 36]} />
            <meshBasicMaterial
              color={poi.unlocked ? COLORS.gold : '#aca3dc'}
              transparent
              opacity={poi.unlocked ? 1 : 0.5}
            />
          </mesh>
          <Html position={[0, 0.35, 0]} center distanceFactor={16} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
            <div className={`poi-chip ${poi.unlocked ? 'poi-chip-ready' : ''}`}>
              {poi.unlocked ? 'ENTRA' : 'PRESTO'} · {poi.label}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

export default function HubWorld({ currentPhase = 1 }: { currentPhase?: number }) {
  return (
    <group>
      <color attach="background" args={['#251d58']} />
      <fog attach="fog" args={['#6d5dbe', 38, 92]} />
      <Sky distance={450000} sunPosition={[1, 0.16, -0.35]} turbidity={5} rayleigh={1.8} />

      <hemisphereLight args={['#dcd4ff', '#3c286e', 2.4]} />
      <ambientLight intensity={0.85} color="#c5bbff" />
      <directionalLight
        position={[20, 30, 12]}
        intensity={3.2}
        color="#fff4dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-far={90}
        shadow-bias={-0.0003}
      />
      <directionalLight position={[-22, 12, -18]} intensity={1.2} color="#a899ff" />

      <Sparkles count={65} scale={[54, 11, 54]} size={2.2} speed={0.22} color="#fff1bd" opacity={0.38} />

      <Ground />
      <Perimeter />
      <BingoHall />
      <SlotArcade />
      <PrizePavilion />
      <Shop />
      <Fountain />
      <Planters />
      <Lamps />
      <PointsOfInterest currentPhase={currentPhase} />
    </group>
  );
}
