import { useEffect, useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import { createNumberBoardTexture } from './textures';

/**
 * The 1–90 tabellone.
 *
 * Painted into a single canvas texture and repainted only when a ball is
 * called, so a board that shows ninety live numbers costs two meshes and no
 * per-frame work.
 */
export function NumberBoard({
  drawnNumbers,
  currentNumber,
  position,
  rotationY = 0,
  width = 6.6,
  height = 2.2,
}: {
  drawnNumbers: readonly number[];
  currentNumber: number | null;
  position: [number, number, number];
  rotationY?: number;
  width?: number;
  height?: number;
}) {
  const board = useMemo(() => createNumberBoardTexture(), []);
  const drawnKey = drawnNumbers.length;
  const painted = useRef(false);

  useEffect(() => () => board?.dispose(), [board]);

  useEffect(() => {
    board?.redraw(drawnNumbers, currentNumber);
    painted.current = true;
  }, [board, drawnKey, currentNumber, drawnNumbers]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <RoundedBox args={[width + 0.24, height + 0.24, 0.12]} radius={0.06} smoothness={2}>
        <meshStandardMaterial color="#241636" roughness={0.42} metalness={0.35} />
      </RoundedBox>
      {board && (
        <mesh position={[0, 0, 0.07]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial map={board.texture} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

export default NumberBoard;
