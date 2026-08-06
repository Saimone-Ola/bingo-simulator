import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import NumberBoard, { useNumberBoardTexture } from './NumberBoard';
import { NUMBER_BOARDS } from './numberBoards';

/**
 * Every tabellone in the hall, off one texture and two materials.
 *
 * There are twenty boards and forty-seven faces of them, which sounds expensive
 * and is not: they all show the same picture, so they share one canvas texture
 * and one material, and none of them does any work between calls. The cost is
 * forty-odd draw calls of static geometry — an order of magnitude less than the
 * chairs were before they were instanced.
 *
 * Where the boards go, and the reading distance that decides it, is worked out
 * in numberBoards.ts where it can be tested without a WebGL context.
 */
export default function HallNumberBoards({
  drawnNumbers,
  currentNumber,
}: {
  drawnNumbers: readonly number[];
  currentNumber: number | null;
}) {
  const texture = useNumberBoardTexture(drawnNumbers, currentNumber);

  // `toneMapped` off so the board reads at the same brightness whatever the
  // house lights are doing: the numbers must stay legible through a blackout
  // event, and dimming them is exactly what tone mapping would do.
  const faceMaterial = useMemo(
    () => (texture ? new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }) : null),
    [texture],
  );
  const housingMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#241636', roughness: 0.42, metalness: 0.35 }),
    [],
  );

  useEffect(() => () => faceMaterial?.dispose(), [faceMaterial]);
  useEffect(() => () => housingMaterial.dispose(), [housingMaterial]);

  return (
    <group>
      {NUMBER_BOARDS.map((placement) => (
        <NumberBoard
          key={placement.id}
          placement={placement}
          texture={texture}
          faceMaterial={faceMaterial}
          housingMaterial={housingMaterial}
        />
      ))}
    </group>
  );
}
