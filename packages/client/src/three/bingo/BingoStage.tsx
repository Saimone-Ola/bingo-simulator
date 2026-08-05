import { useEffect, useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AvatarAppearance } from '@bingo/shared';
import ProceduralCharacter, { type CharacterAnimationState } from '../ProceduralCharacter';
import { NumberBoard } from './NumberBoard';
import { createStageScreenTexture, labelTexture } from './textures';
import type { HallMood } from './eventChoreography';
import { HALL_SHELL, STAGE } from './hallLayout';

/**
 * Stage, presenter, ball machine, big screen and the tabellone behind them.
 *
 * This is the visual anchor of the room: from any seat the player should be able
 * to read the current number without a single HTML panel.
 */

const HOST_APPEARANCE: AvatarAppearance = {
  bodyType: 'athletic',
  skinTone: '#c08a68',
  hairStyle: 'short',
  hairColor: '#2b2029',
  shirtColor: '#7a5cc4',
  pantsColor: '#211d38',
  heightCm: 179,
};

const STAGE_WIDTH = STAGE.maxX - STAGE.minX;
const STAGE_DEPTH = STAGE.maxZ - STAGE.minZ;
const STAGE_CENTRE_Z = (STAGE.maxZ + STAGE.minZ) / 2;

/** Rotating drum of numbered balls behind the presenter. */
function BallMachine({ spinning, reducedMotion }: { spinning: boolean; reducedMotion: boolean }) {
  const drum = useRef<THREE.Group>(null);
  const balls = useMemo(
    () =>
      Array.from({ length: 18 }, (_value, index) => {
        const angle = (index / 18) * Math.PI * 2;
        const tilt = ((index * 37) % 11) / 11 - 0.5;
        return {
          x: Math.cos(angle) * 0.26,
          y: tilt * 0.34,
          z: Math.sin(angle) * 0.26,
          colour: index % 3 === 0 ? '#f6c453' : index % 3 === 1 ? '#f4f0e4' : '#e08a4a',
        };
      }),
    [],
  );

  useFrame((_state, delta) => {
    if (!drum.current || reducedMotion) return;
    drum.current.rotation.y += (spinning ? 1.6 : 0.18) * delta;
  });

  return (
    <group position={[STAGE.urnX, STAGE.height, STAGE.urnZ]}>
      <mesh position={[0, 0.32, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.22, 0.64, 12]} />
        <meshStandardMaterial color="#2a1f33" roughness={0.5} metalness={0.5} />
      </mesh>
      <group ref={drum} position={[0, 1.02, 0]}>
        <mesh>
          <sphereGeometry args={[0.44, 20, 14]} />
          <meshPhysicalMaterial
            color="#cfe4f2"
            roughness={0.06}
            metalness={0}
            transmission={0.72}
            thickness={0.2}
            transparent
            opacity={0.42}
          />
        </mesh>
        {balls.map((ball, index) => (
          <mesh key={index} position={[ball.x, ball.y, ball.z]}>
            <sphereGeometry args={[0.055, 8, 6]} />
            <meshStandardMaterial color={ball.colour} roughness={0.42} />
          </mesh>
        ))}
      </group>
      <mesh position={[0.5, 0.86, 0]} rotation={[0, 0, -0.5]}>
        <cylinderGeometry args={[0.03, 0.03, 0.34, 8]} />
        <meshStandardMaterial color="#b8892f" roughness={0.3} metalness={0.75} />
      </mesh>
    </group>
  );
}

function Microphone({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.01, 0]}>
        <cylinderGeometry args={[0.16, 0.19, 0.03, 12]} />
        <meshStandardMaterial color="#1b1622" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 1.2, 8]} />
        <meshStandardMaterial color="#2b2533" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, 1.24, 0.04]} rotation={[0.35, 0, 0]}>
        <capsuleGeometry args={[0.035, 0.07, 4, 10]} />
        <meshStandardMaterial color="#3a3446" roughness={0.35} metalness={0.7} />
      </mesh>
    </group>
  );
}

function StageSpot({
  x,
  energy,
  colour,
  reducedMotion,
}: {
  x: number;
  energy: number;
  colour: string;
  reducedMotion: boolean;
}) {
  const light = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    if (!light.current) return;
    const sweep = reducedMotion ? 0 : Math.sin(clock.elapsedTime * (0.4 + energy)) * energy * 2.4;
    target.position.set(x * 0.4 + sweep, STAGE.height, STAGE_CENTRE_Z + 0.4);
    target.updateMatrixWorld();
    light.current.intensity = 26 + energy * 40;
  });

  return (
    <group>
      <primitive object={target} />
      <spotLight
        ref={light}
        position={[x, 5.4, STAGE.maxZ + 0.6]}
        angle={0.42}
        penumbra={0.7}
        distance={14}
        decay={1.6}
        color={colour}
        intensity={30}
        target={target}
      />
      {/*
        The fixture the spotlight comes out of.

        This was a bare metallic cone hanging in mid-air with nothing holding it
        up, which against a dark ceiling read as a paper aeroplane floating over
        the hall. A lamp needs somewhere to be attached to before it reads as a
        lamp: plate, drop rod, barrel, lens.
      */}
      <group position={[x, 0, STAGE.maxZ + 0.6]}>
        <mesh position={[0, HALL_SHELL.ceilingHeight - 0.04, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 0.06, 12]} />
          <meshStandardMaterial color="#2a2033" roughness={0.6} metalness={0.3} />
        </mesh>
        <mesh position={[0, (HALL_SHELL.ceilingHeight + 5.62) / 2, 0]}>
          <cylinderGeometry args={[0.022, 0.022, HALL_SHELL.ceilingHeight - 5.62, 8]} />
          <meshStandardMaterial color="#2a2033" roughness={0.6} metalness={0.4} />
        </mesh>
        <group position={[0, 5.5, 0]} rotation={[Math.PI / 2.6, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.15, 0.11, 0.34, 12]} />
            <meshStandardMaterial color="#2b2135" roughness={0.5} metalness={0.45} />
          </mesh>
          {/* Lens, lit so the beam has a visible source. */}
          <mesh position={[0, -0.18, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.02, 12]} />
            <meshStandardMaterial
              color={colour}
              emissive={colour}
              emissiveIntensity={1.6}
              toneMapped={false}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export function BingoStage({
  currentNumber,
  drawnNumbers,
  headline,
  footer,
  mood,
  reducedMotion,
  shadows,
  spinning,
  hostState,
}: {
  currentNumber: number | null;
  drawnNumbers: readonly number[];
  headline: string;
  footer: string;
  mood: HallMood;
  reducedMotion: boolean;
  shadows: boolean;
  spinning: boolean;
  hostState: CharacterAnimationState;
}) {
  const screen = useMemo(() => createStageScreenTexture(), []);
  const recent = useMemo(() => [...drawnNumbers].slice(-6).reverse(), [drawnNumbers]);
  const backdrop = useMemo(
    () => labelTexture('SALA BINGO', { color: '#f6c453', fontScale: 0.46 }),
    [],
  );

  useEffect(() => () => screen?.dispose(), [screen]);
  useEffect(() => {
    screen?.redraw({
      headline,
      current: currentNumber,
      recent,
      footer,
      accent: mood.caption ? '#ffb4c8' : '#c4b5fd',
    });
  }, [screen, headline, currentNumber, recent, footer, mood.caption]);

  return (
    <group>
      {/* Platform */}
      <mesh position={[0, STAGE.height / 2, STAGE_CENTRE_Z]} receiveShadow castShadow={shadows}>
        <boxGeometry args={[STAGE_WIDTH, STAGE.height, STAGE_DEPTH]} />
        <meshStandardMaterial color="#4a2434" roughness={0.62} metalness={0.12} />
      </mesh>
      <mesh position={[0, STAGE.height + 0.004, STAGE_CENTRE_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[STAGE_WIDTH - 0.1, STAGE_DEPTH - 0.1]} />
        <meshStandardMaterial color="#6d1f46" roughness={0.85} />
      </mesh>

      {/* Back drapes */}
      <mesh position={[0, 3.1, STAGE.minZ + 0.12]} receiveShadow>
        <boxGeometry args={[STAGE_WIDTH + 1.6, 6, 0.16]} />
        <meshStandardMaterial color="#4a1130" roughness={0.95} />
      </mesh>
      {backdrop && (
        <mesh position={[0, 5.1, STAGE.minZ + 0.22]}>
          <planeGeometry args={[4.2, 0.6]} />
          <meshBasicMaterial map={backdrop} transparent toneMapped={false} />
        </mesh>
      )}

      {/* Big screen */}
      <group position={[0, 3.3, STAGE.minZ + 0.26]}>
        <RoundedBox args={[4.4, 2.3, 0.14]} radius={0.06} smoothness={2}>
          <meshStandardMaterial color="#0b0814" roughness={0.35} metalness={0.4} />
        </RoundedBox>
        {screen && (
          <mesh position={[0, 0, 0.08]}>
            <planeGeometry args={[4.2, 2.1]} />
            <meshBasicMaterial map={screen.texture} toneMapped={false} />
          </mesh>
        )}
      </group>

      {/* Tabellone flanking the screen, readable from the far tables */}
      <NumberBoard
        drawnNumbers={drawnNumbers}
        currentNumber={currentNumber}
        position={[-7.4, 2.9, -7.2]}
        rotationY={0.66}
        width={5.6}
        height={2.0}
      />
      <NumberBoard
        drawnNumbers={drawnNumbers}
        currentNumber={currentNumber}
        position={[7.4, 2.9, -7.2]}
        rotationY={-0.66}
        width={5.6}
        height={2.0}
      />

      <BallMachine spinning={spinning} reducedMotion={reducedMotion} />
      <Microphone position={[STAGE.hostX - 0.55, STAGE.height, STAGE.hostZ + 0.35]} />

      {/* Presenter's lectern */}
      <RoundedBox
        args={[0.9, 1.06, 0.42]}
        radius={0.05}
        smoothness={2}
        position={[STAGE.hostX + 0.75, STAGE.height + 0.53, STAGE.hostZ + 0.5]}
        castShadow={shadows}
      >
        <meshStandardMaterial color="#3b2038" roughness={0.6} metalness={0.2} />
      </RoundedBox>

      <ProceduralCharacter
        appearance={HOST_APPEARANCE}
        state={hostState}
        personality="LOUD"
        position={[STAGE.hostX, STAGE.height, STAGE.hostZ]}
        rotationY={0}
        scale={1}
        phase={1.7}
        reducedMotion={reducedMotion}
      />

      <StageSpot x={-3.2} energy={mood.spotlightEnergy} colour="#ffd9a0" reducedMotion={reducedMotion} />
      <StageSpot x={3.2} energy={mood.spotlightEnergy} colour="#c4a2ff" reducedMotion={reducedMotion} />
    </group>
  );
}

export default BingoStage;
