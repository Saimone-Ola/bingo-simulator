import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HALL_SHELL } from './hallLayout';

/**
 * Falling confetti, drawn as a single InstancedMesh.
 *
 * One draw call for the whole effect, with the per-instance state kept in plain
 * arrays so no `Vector3` is allocated inside the frame loop.
 */
const COUNT = 160;
const COLOURS = ['#fde047', '#f472b6', '#60a5fa', '#34d399', '#fb923c'] as const;

export function HallConfetti({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const state = useMemo(() => {
    const width = HALL_SHELL.maxX - HALL_SHELL.minX - 1;
    const depth = HALL_SHELL.maxZ - HALL_SHELL.minZ - 1;
    return {
      x: new Float32Array(COUNT),
      y: new Float32Array(COUNT),
      z: new Float32Array(COUNT),
      speed: new Float32Array(COUNT),
      spin: new Float32Array(COUNT),
      angle: new Float32Array(COUNT),
      width,
      depth,
    };
  }, []);

  useEffect(() => {
    const centreX = (HALL_SHELL.maxX + HALL_SHELL.minX) / 2;
    const centreZ = (HALL_SHELL.maxZ + HALL_SHELL.minZ) / 2;
    for (let index = 0; index < COUNT; index += 1) {
      state.x[index] = centreX + (Math.random() - 0.5) * state.width;
      state.z[index] = centreZ + (Math.random() - 0.5) * state.depth;
      state.y[index] = Math.random() * HALL_SHELL.ceilingHeight;
      state.speed[index] = 0.9 + Math.random() * 1.5;
      state.spin[index] = (Math.random() - 0.5) * 6;
      state.angle[index] = Math.random() * Math.PI * 2;
    }
  }, [state]);

  // Per-instance colours are written once; only the matrices change per frame.
  useEffect(() => {
    const node = mesh.current;
    if (!node || !active) return;
    const colour = new THREE.Color();
    for (let index = 0; index < COUNT; index += 1) {
      colour.set(COLOURS[index % COLOURS.length] ?? '#fde047');
      node.setColorAt(index, colour);
    }
    if (node.instanceColor) node.instanceColor.needsUpdate = true;
  }, [active]);

  useFrame((_frame, delta) => {
    const node = mesh.current;
    if (!node || !active) return;
    const step = Math.min(delta, 0.05);
    for (let index = 0; index < COUNT; index += 1) {
      const fall = reducedMotion ? 0 : (state.speed[index] ?? 1) * step;
      let y = (state.y[index] ?? 0) - fall;
      if (y < 0.02) y = HALL_SHELL.ceilingHeight;
      state.y[index] = y;
      state.angle[index] = (state.angle[index] ?? 0) + (reducedMotion ? 0 : (state.spin[index] ?? 0) * step);

      dummy.position.set(state.x[index] ?? 0, y, state.z[index] ?? 0);
      dummy.rotation.set(state.angle[index] ?? 0, (state.angle[index] ?? 0) * 0.7, 0);
      dummy.updateMatrix();
      node.setMatrixAt(index, dummy.matrix);
    }
    node.instanceMatrix.needsUpdate = true;
  });

  if (!active) return null;

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <planeGeometry args={[0.07, 0.11]} />
      <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}

export default HallConfetti;
