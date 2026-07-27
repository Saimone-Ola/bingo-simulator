import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AdaptiveDpr, Grid, OrbitControls, Stats } from '@react-three/drei';
import type { Mesh } from 'three';

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
      <meshStandardMaterial color="#7c5cff" roughness={0.25} metalness={0.4} />
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
      <color attach="background" args={['#0b0a1a']} />
      <fog attach="fog" args={['#0b0a1a', 12, 30]} />

      {/*
        Lighting is entirely local and analytic. drei's <Environment preset>
        would be prettier, but it downloads an HDR from a third-party CDN at
        runtime: an external dependency in the render path that blanks the whole
        scene when it is unreachable, and a request from the player's browser to
        a host we do not control. Any image-based lighting we adopt later ships
        from our own asset bundle.
      */}
      <hemisphereLight args={['#8a7dff', '#120f26', 0.6]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 8, 5]} intensity={1.8} castShadow />
      <pointLight position={[-4, 2, -3]} intensity={18} color="#ffb020" distance={14} />

      <Suspense fallback={null}>
        <SpinningBall />
      </Suspense>

      <Grid
        args={[40, 40]}
        cellColor="#2a2750"
        sectionColor="#423d70"
        fadeDistance={28}
        infiniteGrid
      />

      <OrbitControls enablePan={false} minDistance={3} maxDistance={14} maxPolarAngle={1.4} />
      <AdaptiveDpr pixelated />
      {showStats && <Stats />}
    </Canvas>
  );
}
