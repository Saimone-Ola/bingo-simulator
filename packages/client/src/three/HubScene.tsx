import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr, Stats } from '@react-three/drei';
import Crowd from './Crowd';
import HubWorld from './HubWorld';
import PlayerController from './PlayerController';

/**
 * The hub canvas.
 *
 * Performance decisions that matter for the 20-avatar / 60 FPS budget:
 *  - the pixel ratio is capped at 2, because a 3x phone screen is not worth
 *    nine times the fragments;
 *  - `AdaptiveDpr` drops resolution rather than frames when the GPU falls
 *    behind, which is the trade a moving crowd wants;
 *  - shadows are rendered once from a single directional light, not per light;
 *  - the crowd is instanced (see Crowd.tsx), so the whole plaza is three draw
 *    calls rather than sixty.
 */
export default function HubScene({ showStats = false }: { showStats?: boolean }) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 4, 14], fov: 55, near: 0.1, far: 120 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        // Diagnostic hook. Draw calls and triangle count are the numbers that
        // actually describe the scene's cost, and unlike FPS they do not
        // depend on the machine measuring them - which makes them the only
        // useful thing to assert in a headless, GPU-less test environment.
        (window as unknown as { bingoRenderStats?: () => unknown }).bingoRenderStats = () => ({
          drawCalls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          programs: gl.info.programs?.length ?? 0,
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
        });
      }}
    >
      <Suspense fallback={null}>
        <HubWorld />
        <Crowd />
      </Suspense>
      <PlayerController />
      <AdaptiveDpr pixelated />
      {showStats && <Stats />}
    </Canvas>
  );
}
