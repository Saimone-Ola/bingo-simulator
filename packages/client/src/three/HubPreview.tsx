import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AdaptiveDpr, Grid, OrbitControls, Stats } from '@react-three/drei';
import type { Mesh } from 'three';
import { WORLD_FOG, WORLD_PALETTE } from './palette';

/**
 * Phase 0 placeholder scene.
 *
 * Its only job is to prove the rendering pipeline end to end: R3F mounts,
 * Three.js resolves, the chunk splits, and the perf overlay reports frame time.
 * The real hub - streamed avatars, instanced crowd, LOD and Rapier physics -
 * replaces this in phase 1.
 */
function SpinningBall() {
  const mesh = useRef<Mesh>(null);

  useFrame((_state, delta) => {
    if (!mesh.current) return;
    mesh.current.rotation.y += delta * 0.4;
    mesh.current.rotation.x += delta * 0.15;
  });

  return (
    <mesh ref={mesh} castShadow position={[0, 1.2, 0]}>
      <icosahedronGeometry args={[1, 3]} />
      <meshStandardMaterial color={WORLD_PALETTE.brand} roughness={0.25} metalness={0.4} />
    </mesh>
  );
}

export default function HubPreview({ showStats = false }: { showStats?: boolean }) {
  return (
    <Canvas
      shadows
      camera={{ position: [4, 3, 6], fov: 50 }}
      // Cap the pixel ratio: a 3x phone screen is not worth 9x the fragments.
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[WORLD_PALETTE.background]} />
      <fog attach="fog" args={[WORLD_PALETTE.fog, WORLD_FOG.near, WORLD_FOG.far]} />

      {/*
        Lighting is entirely local and analytic. drei's <Environment preset>
        would be prettier, but it downloads an HDR from a third-party CDN at
        runtime: an external dependency in the render path that blanks the whole
        scene when it is unreachable, and a request from the player's browser to
        a host we do not control. Any image-based lighting we adopt later ships
        from our own asset bundle.
      */}
      <hemisphereLight args={[WORLD_PALETTE.fillLight, WORLD_PALETTE.bounceLight, 0.6]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.8}
        color={WORLD_PALETTE.keyLight}
        castShadow
      />
      <pointLight
        position={[-4, 2, -3]}
        intensity={18}
        color={WORLD_PALETTE.accent}
        distance={14}
      />

      <Suspense fallback={null}>
        <SpinningBall />
      </Suspense>

      <Grid
        args={[40, 40]}
        cellColor={WORLD_PALETTE.gridCell}
        sectionColor={WORLD_PALETTE.gridSection}
        fadeDistance={28}
        infiniteGrid
      />

      <OrbitControls enablePan={false} minDistance={3} maxDistance={14} maxPolarAngle={1.4} />
      <AdaptiveDpr pixelated />
      {showStats && <Stats />}
    </Canvas>
  );
}
