import { useMemo } from 'react';
import { HUB_BOUNDS, HUB_OBSTACLES, HUB_POIS } from '@bingo/shared';
import { WORLD_FOG, WORLD_PALETTE } from './palette';

/**
 * The static hub: ground, the obstacles the server also knows about, and a
 * marker for each destination.
 *
 * Everything here is built from the same `HUB_OBSTACLES` the server collides
 * against, so what a player sees is exactly what they can walk into. A
 * decorative prop that is not in that list would be a wall you can walk
 * through; a collider not drawn here would be an invisible wall.
 */
function Ground() {
  const width = HUB_BOUNDS.maxX - HUB_BOUNDS.minX;
  const depth = HUB_BOUNDS.maxZ - HUB_BOUNDS.minZ;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial color="#141230" roughness={0.9} metalness={0.05} />
    </mesh>
  );
}

/** A low wall around the plaza so the bounds read as architecture, not a void. */
function Perimeter() {
  const width = HUB_BOUNDS.maxX - HUB_BOUNDS.minX;
  const depth = HUB_BOUNDS.maxZ - HUB_BOUNDS.minZ;
  const height = 1.2;
  const thickness = 0.4;

  const walls: [number, number, number, number][] = [
    [0, HUB_BOUNDS.minZ, width, thickness],
    [0, HUB_BOUNDS.maxZ, width, thickness],
    [HUB_BOUNDS.minX, 0, thickness, depth],
    [HUB_BOUNDS.maxX, 0, thickness, depth],
  ];

  return (
    <group>
      {walls.map(([x, z, sx, sz], index) => (
        <mesh key={index} position={[x, height / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[sx, height, sz]} />
          <meshStandardMaterial color="#211f45" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/** Draws the collision volumes as actual scenery. */
function Obstacles() {
  return (
    <group>
      {HUB_OBSTACLES.map((obstacle, index) => {
        if (obstacle.kind === 'circle') {
          const isFountain = obstacle.radius > 2.5;
          const height = isFountain ? 0.9 : 0.7;
          return (
            <group key={`c${index}`} position={[obstacle.x, 0, obstacle.z]}>
              <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[obstacle.radius, obstacle.radius, height, 24]} />
                <meshStandardMaterial color="#2a2750" roughness={0.7} />
              </mesh>
              {isFountain && (
                <mesh position={[0, height + 0.6, 0]} castShadow>
                  <cylinderGeometry args={[0.35, 0.6, 1.2, 16]} />
                  <meshStandardMaterial
                    color={WORLD_PALETTE.brand}
                    emissive={WORLD_PALETTE.brand}
                    emissiveIntensity={0.4}
                    roughness={0.3}
                  />
                </mesh>
              )}
            </group>
          );
        }

        return (
          <mesh
            key={`b${index}`}
            position={[obstacle.x, 2, obstacle.z]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[obstacle.halfX * 2, 4, obstacle.halfZ * 2]} />
            <meshStandardMaterial color="#1c1a3c" roughness={0.85} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * A glowing pad on each destination. Locked ones are dimmed rather than
 * hidden: showing where the game is going is worth more than pretending the
 * plaza is finished.
 */
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
        <mesh
          key={poi.id}
          position={[poi.standX, 0.02, poi.standZ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[1.1, 1.5, 32]} />
          <meshBasicMaterial
            color={poi.unlocked ? WORLD_PALETTE.accent : WORLD_PALETTE.gridSection}
            transparent
            opacity={poi.unlocked ? 0.85 : 0.35}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function HubWorld({ currentPhase = 1 }: { currentPhase?: number }) {
  return (
    <group>
      <color attach="background" args={[WORLD_PALETTE.background]} />
      <fog attach="fog" args={[WORLD_PALETTE.fog, WORLD_FOG.near + 10, WORLD_FOG.far + 30]} />

      {/*
        Analytic lighting only. drei's <Environment preset> downloads an HDR
        from a third-party CDN at runtime: an external dependency in the render
        path that blanks the whole scene when it is unreachable.
      */}
      <hemisphereLight args={[WORLD_PALETTE.fillLight, WORLD_PALETTE.bounceLight, 0.55]} />
      <ambientLight intensity={0.22} />
      <directionalLight
        position={[18, 26, 12]}
        intensity={1.5}
        color={WORLD_PALETTE.keyLight}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={35}
        shadow-camera-bottom={-35}
        shadow-camera-far={80}
      />
      <pointLight
        position={[0, 4, 0]}
        intensity={40}
        distance={18}
        color={WORLD_PALETTE.accent}
      />

      <Ground />
      <Perimeter />
      <Obstacles />
      <PointsOfInterest currentPhase={currentPhase} />
    </group>
  );
}
