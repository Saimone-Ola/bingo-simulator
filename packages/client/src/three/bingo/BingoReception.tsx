import { useEffect, useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AvatarAppearance } from '@bingo/shared';
import ProceduralCharacter from '../ProceduralCharacter';
import { labelTexture } from './textures';
import { RECEPTION } from './hallLayout';

/**
 * Entrance desk where cards are bought.
 *
 * The desk carries a live info board (room name, code, headcount, price, phase)
 * so the state a lobby screen would normally show lives in the world instead,
 * and an attendant NPC who reacts when the player walks up.
 */

const CLERK_APPEARANCE: AvatarAppearance = {
  bodyType: 'slim',
  skinTone: '#d8a883',
  hairStyle: 'bob',
  hairColor: '#3a2419',
  shirtColor: '#c2455f',
  pantsColor: '#22203a',
  heightCm: 168,
};

export interface ReceptionInfo {
  readonly roomName: string;
  readonly roomCode: string;
  readonly playerCount: number;
  readonly maxPlayers: number;
  readonly cardPrice: number;
  readonly phaseLabel: string;
}

function InfoBoard({ info }: { info: ReceptionInfo }) {
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 384;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#120c20';
    context.fillRect(0, 0, 768, 384);
    context.fillStyle = '#f6c453';
    context.fillRect(0, 0, 768, 8);

    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    context.font = '800 46px Inter, system-ui, sans-serif';
    context.fillText(info.roomName, 34, 62);

    const rows: Array<[string, string, string]> = [
      ['CODICE SALA', info.roomCode, '#c4b5fd'],
      ['GIOCATORI', `${info.playerCount} / ${info.maxPlayers}`, '#8ee8de'],
      ['CARTELLA', `${info.cardPrice} crediti`, '#f6c453'],
      ['STATO', info.phaseLabel, '#ffb4c8'],
    ];
    rows.forEach(([label, value, colour], index) => {
      const y = 132 + index * 62;
      context.fillStyle = '#7c6fa8';
      context.font = '700 24px Inter, system-ui, sans-serif';
      context.fillText(label, 34, y);
      context.fillStyle = colour;
      context.textAlign = 'right';
      context.font = '800 34px Inter, system-ui, sans-serif';
      context.fillText(value, 734, y);
      context.textAlign = 'left';
    });

    const next = new THREE.CanvasTexture(canvas);
    next.colorSpace = THREE.SRGBColorSpace;
    return next;
  }, [info.cardPrice, info.maxPlayers, info.phaseLabel, info.playerCount, info.roomCode, info.roomName]);

  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;

  // The desk stands against the entrance wall and serves the room, which lies
  // towards -Z: every face of it has to be turned that way.
  return (
    <group position={[0, 2.34, 0.6]} rotation={[0, Math.PI, 0]}>
      <RoundedBox args={[2.5, 1.28, 0.08]} radius={0.05} smoothness={2}>
        <meshStandardMaterial color="#0d0918" roughness={0.4} metalness={0.3} emissive="#160f28" emissiveIntensity={0.6} />
      </RoundedBox>
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[2.3, 1.14]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function BingoReception({
  info,
  highlighted,
  reducedMotion,
  shadows,
  onActivate,
}: {
  info: ReceptionInfo;
  highlighted: boolean;
  reducedMotion: boolean;
  shadows: boolean;
  onActivate: () => void;
}) {
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const signTexture = useMemo(
    () => labelTexture('CASSA · CARTELLE', { color: '#0f0a1c', background: '#f6c453', fontScale: 0.42 }),
    [],
  );

  useFrame(({ clock }) => {
    if (!glow.current) return;
    const base = highlighted ? 1.4 : 0.45;
    const pulse = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 3) * (highlighted ? 0.35 : 0.08);
    glow.current.emissiveIntensity = base + pulse;
  });

  return (
    <group position={[RECEPTION.x, 0, RECEPTION.z]}>
      {/* Desk body. The counter reads as furniture, so the "come and buy"
          signal is a light strip along its front rather than a glowing box. */}
      <RoundedBox
        args={[RECEPTION.width, RECEPTION.height, RECEPTION.depth]}
        radius={0.05}
        smoothness={2}
        position={[0, RECEPTION.height / 2, 0]}
        castShadow={shadows}
        receiveShadow
        onPointerDown={(event) => {
          event.stopPropagation();
          onActivate();
        }}
      >
        <meshStandardMaterial color="#3a2038" roughness={0.6} metalness={0.15} />
      </RoundedBox>
      <mesh position={[0, 0.24, -RECEPTION.depth / 2 - 0.012]}>
        <planeGeometry args={[RECEPTION.width - 0.3, 0.07]} />
        <meshStandardMaterial ref={glow} color="#7a5320" emissive="#f6c453" emissiveIntensity={0.45} toneMapped={false} />
      </mesh>
      <mesh position={[0, RECEPTION.height + 0.03, -0.06]} castShadow={shadows}>
        <boxGeometry args={[RECEPTION.width + 0.16, 0.06, RECEPTION.depth + 0.22]} />
        <meshStandardMaterial color="#7c5138" roughness={0.42} metalness={0.1} />
      </mesh>

      {/* Card stacks and a bell on the counter */}
      {[-1.2, -0.85, -0.5].map((offset, index) => (
        <mesh key={offset} position={[offset, RECEPTION.height + 0.09 + index * 0.006, -0.02]} rotation={[0, index * 0.12, 0]} castShadow={shadows}>
          <boxGeometry args={[0.3, 0.024, 0.13]} />
          <meshStandardMaterial color="#efe3c6" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[1.3, RECEPTION.height + 0.11, -0.05]} castShadow={shadows}>
        <sphereGeometry args={[0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#c9a227" roughness={0.24} metalness={0.85} />
      </mesh>

      {/* Fascia sign. Hanging it above the counter would mask both the clerk
          and the info board, so it lives on the front of the desk itself. */}
      <mesh position={[0, 0.68, -RECEPTION.depth / 2 - 0.014]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.7, 0.3]} />
        {signTexture ? (
          <meshBasicMaterial map={signTexture} toneMapped={false} />
        ) : (
          <meshBasicMaterial color="#f6c453" />
        )}
      </mesh>

      <InfoBoard info={info} />

      <pointLight position={[0, 2.05, -1.2]} color="#ffd9a0" intensity={highlighted ? 20 : 11} distance={8} decay={1.7} />

      {/* The clerk stands behind the counter, facing the room. */}
      <ProceduralCharacter
        appearance={CLERK_APPEARANCE}
        state={highlighted ? 'TALK' : 'IDLE'}
        personality="CALM"
        position={[-0.5, 0, 0.72]}
        rotationY={Math.PI}
        scale={0.94}
        phase={2.1}
        reducedMotion={reducedMotion}
      />
    </group>
  );
}

export default BingoReception;
