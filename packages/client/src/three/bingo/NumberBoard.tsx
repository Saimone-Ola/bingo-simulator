import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createNumberBoardTexture } from './textures';
import { HALL_SHELL } from './hallLayout';
import { HANGING_HOUSING_MARGIN, type BoardPlacement } from './numberBoards';

/**
 * The 1–90 tabellone, drawn wherever one hangs.
 *
 * Painted into a canvas texture and repainted only when a ball is called, so a
 * board showing ninety live numbers costs no per-frame work at all.
 *
 * The texture is created once for the whole hall and handed to every board,
 * which is what makes it affordable to have twenty of them: a canvas each would
 * be twenty 1536×512 uploads to repaint on every call, for twenty pictures that
 * are pixel for pixel identical.
 */

/**
 * The hall's single tabellone texture.
 *
 * Returns null where there is no canvas — the scene has to survive a renderer
 * without 2D support rather than take the room down with it.
 */
export function useNumberBoardTexture(
  drawnNumbers: readonly number[],
  currentNumber: number | null,
): THREE.Texture | null {
  const board = useMemo(() => createNumberBoardTexture(), []);

  useEffect(() => () => board?.dispose(), [board]);

  /**
   * What a repaint actually depends on.
   *
   * The array arrives rebuilt from the room snapshot on every message, so
   * depending on its identity would repaint 1536 × 512 pixels every time a
   * player somewhere else in the hall took a step. Numbers are only ever
   * appended and the list is emptied between rounds, so the count and the
   * current ball identify the picture completely.
   */
  const paintKey = `${drawnNumbers.length}:${currentNumber ?? ''}`;

  useEffect(() => {
    board?.redraw(drawnNumbers, currentNumber);
    // Keyed deliberately, rather than depending on the array itself.
  }, [board, paintKey]);

  return board?.texture ?? null;
}

export interface NumberBoardProps {
  placement: BoardPlacement;
  texture: THREE.Texture | null;
  /** Shared so twenty boards do not become twenty materials. */
  faceMaterial: THREE.Material | null;
  housingMaterial: THREE.Material;
}

/**
 * One board: a housing, a lit face per readable side, and a drop rod if it hangs.
 *
 * A four-faced unit is a square box with the same picture on all four sides,
 * which is how a hall covers a floor rather than a corridor — see numberBoards.ts
 * for where they go and why.
 */
export function NumberBoard({
  placement,
  texture,
  faceMaterial,
  housingMaterial,
}: NumberBoardProps) {
  const { x, y, z, width, height, faces, mount } = placement;
  const hanging = mount === 'HANGING';
  const housingSide = width + HANGING_HOUSING_MARGIN * 2;
  const housingHeight = height + 0.24;
  // Just clear of the housing, or the two coplanar surfaces fight for depth.
  const faceOffset = (hanging ? housingSide : 0.12) / 2 + 0.012;
  /** Ceiling to the top of the housing, in the group's local frame. */
  const rodLength = HALL_SHELL.ceilingHeight - y - housingHeight / 2;

  return (
    <group position={[x, y, z]}>
      {hanging ? (
        <mesh>
          <boxGeometry args={[housingSide, housingHeight, housingSide]} />
          <primitive object={housingMaterial} attach="material" />
        </mesh>
      ) : (
        <mesh rotation={[0, faces[0] ?? 0, 0]}>
          <boxGeometry args={[width + 0.24, housingHeight, 0.12]} />
          <primitive object={housingMaterial} attach="material" />
        </mesh>
      )}

      {texture &&
        faceMaterial &&
        faces.map((yaw) => (
          <mesh
            key={yaw}
            position={[Math.sin(yaw) * faceOffset, 0, Math.cos(yaw) * faceOffset]}
            rotation={[0, yaw, 0]}
          >
            <planeGeometry args={[width, height]} />
            <primitive object={faceMaterial} attach="material" />
          </mesh>
        ))}

      {/* Something has to hold a unit up, or it reads as a bug rather than a
          fitting — the stage spotlight taught us that once already. */}
      {hanging && rodLength > 0 && (
        <mesh position={[0, housingHeight / 2 + rodLength / 2, 0]}>
          <cylinderGeometry args={[0.06, 0.06, rodLength, 6]} />
          <primitive object={housingMaterial} attach="material" />
        </mesh>
      )}
    </group>
  );
}

export default NumberBoard;
