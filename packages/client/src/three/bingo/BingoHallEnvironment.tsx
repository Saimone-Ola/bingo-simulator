import { HALL_PALETTE } from '../palette';
import { useEffect, useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { labelTexture } from './textures';
import type { HallMood } from './eventChoreography';
import { CEILING_LAMPS, ENTRANCE, HALL_SHELL, SPAWN, STAGE, TABLES } from './hallLayout';

/**
 * Shell of the hall: floor, walls, ceiling, house lighting and the small
 * architectural details that stop a room reading as a grey box — carpet borders,
 * wall panelling, exit signs, service doors, advertising panels.
 *
 * Nothing here is interactive; it exists so the space feels like a venue.
 */

const WIDTH = HALL_SHELL.maxX - HALL_SHELL.minX;
const DEPTH = HALL_SHELL.maxZ - HALL_SHELL.minZ;
const CENTRE_X = (HALL_SHELL.maxX + HALL_SHELL.minX) / 2;
const CENTRE_Z = (HALL_SHELL.maxZ + HALL_SHELL.minZ) / 2;

function Sign({
  text,
  position,
  rotationY = 0,
  width = 2,
  height = 0.44,
  color = HALL_PALETTE.paper,
  background,
  emissive = 0.9,
}: {
  text: string;
  position: [number, number, number];
  rotationY?: number;
  width?: number;
  height?: number;
  color?: string;
  background?: string;
  emissive?: number;
}) {
  const texture = useMemo(
    () => labelTexture(text, background ? { color, background, fontScale: 0.5 } : { color, fontScale: 0.5 }),
    [text, color, background],
  );
  if (!texture) return null;
  return (
    <mesh position={position} rotation={[0, rotationY, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent={!background} toneMapped={false} opacity={emissive} />
    </mesh>
  );
}

function ExitSign({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <RoundedBox args={[0.62, 0.24, 0.05]} radius={0.03} smoothness={2}>
        <meshStandardMaterial color="#0d2417" emissive="#0f5132" emissiveIntensity={0.8} roughness={0.5} />
      </RoundedBox>
      <Sign text="USCITA" position={[0, 0, 0.03]} width={0.55} height={0.18} color="#7dffb0" />
    </group>
  );
}

function ServiceDoor({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <RoundedBox args={[1.15, 2.24, 0.08]} radius={0.03} smoothness={2} position={[0, 1.12, 0]} receiveShadow>
        <meshStandardMaterial color="#2b2033" roughness={0.72} metalness={0.16} />
      </RoundedBox>
      <mesh position={[0.4, 1.05, 0.06]}>
        <cylinderGeometry args={[0.024, 0.024, 0.18, 8]} />
        <meshStandardMaterial color="#c2a15c" roughness={0.32} metalness={0.7} />
      </mesh>
    </group>
  );
}

/** Slowly cycling advertising panel; pure decoration, never gameplay state. */
function AdPanel({ position, rotationY, reducedMotion }: { position: [number, number, number]; rotationY: number; reducedMotion: boolean }) {
  const material = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!material.current) return;
    const pulse = reducedMotion ? 0.55 : 0.55 + Math.sin(clock.elapsedTime * 0.6 + position[0]) * 0.12;
    material.current.emissiveIntensity = pulse;
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <RoundedBox args={[1.9, 1.05, 0.09]} radius={0.05} smoothness={2}>
        <meshStandardMaterial ref={material} color="#241539" emissive="#6d28d9" emissiveIntensity={0.6} roughness={0.4} />
      </RoundedBox>
      <Sign text="GIOCA CON MISURA" position={[0, 0.12, 0.06]} width={1.6} height={0.26} color="#e9d8ff" />
      <Sign text="SOLO CREDITI VIRTUALI" position={[0, -0.2, 0.06]} width={1.5} height={0.2} color="#a5f3ec" />
    </group>
  );
}

function CeilingLamp({
  x,
  z,
  intensity,
  color,
  withLight,
}: {
  x: number;
  z: number;
  intensity: number;
  color: string;
  withLight: boolean;
}) {
  return (
    <group position={[x, HALL_SHELL.ceilingHeight - 0.55, z]}>
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.44, 6]} />
        <meshStandardMaterial color={HALL_PALETTE.metal} roughness={0.6} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.34, 0.46, 0.22, 12]} />
        <meshStandardMaterial color={HALL_PALETTE.metal} roughness={0.55} metalness={0.4} />
      </mesh>
      <mesh position={[0, -0.12, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.04, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5 * intensity} toneMapped={false} />
      </mesh>
      {withLight && <pointLight color={color} intensity={30 * intensity} distance={13} decay={1.8} position={[0, -0.4, 0]} />}
    </group>
  );
}

export function BingoHallEnvironment({
  mood,
  accentLights,
  shadows,
  reducedMotion,
}: {
  mood: HallMood;
  accentLights: number;
  shadows: boolean;
  reducedMotion: boolean;
}) {
  const carpetTexture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = HALL_PALETTE.carpet;
    context.fillRect(0, 0, 128, 128);
    // A subtle damask-ish speckle keeps the carpet from looking like flat vinyl.
    for (let index = 0; index < 900; index += 1) {
      const x = ((index * 47) % 127);
      const y = ((index * 73) % 127);
      context.fillStyle = index % 3 === 0 ? HALL_PALETTE.carpetWeave : HALL_PALETTE.carpetShade;
      context.fillRect(x, y, 2, 2);
    }
    context.strokeStyle = HALL_PALETTE.carpetWeave;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(64, 64, 34, 0, Math.PI * 2);
    context.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(WIDTH / 2, DEPTH / 2);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);

  /**
   * Which lamps carry a real light.
   *
   * Point lights are the expensive part and painted ones are not, so the quality
   * profile decides how many are lit. They are spread by stride rather than taken
   * from the front of the list: on a low setting the first three lamps in the
   * array are one corner of the hall, and the rest of the room would sit dark.
   */
  const lampPositions = useMemo(() => {
    const stride = Math.max(1, Math.round(CEILING_LAMPS.length / Math.max(1, accentLights)));
    return CEILING_LAMPS.map((lamp, index) => ({ ...lamp, lit: index % stride === 0 }));
  }, [accentLights]);

  useEffect(() => () => carpetTexture?.dispose(), [carpetTexture]);

  const houseColor = mood.emergencyLights ? '#4b60ff' : mood.greenWash ? '#8dff9f' : HALL_PALETTE.key;
  const aisleEnd = SPAWN.z + 1.4;
  const aisleStart = STAGE.maxZ + 0.2;
  const tableRows = useMemo(() => [...new Set(TABLES.map((table) => table.z))].sort((a, b) => a - b), []);

  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CENTRE_X, 0, CENTRE_Z]} receiveShadow>
        <planeGeometry args={[WIDTH, DEPTH]} />
        {carpetTexture ? (
          <meshStandardMaterial map={carpetTexture} roughness={0.96} metalness={0} color={mood.greenWash ? '#9fe5a8' : '#ffffff'} />
        ) : (
          <meshStandardMaterial color={HALL_PALETTE.carpet} roughness={0.96} />
        )}
      </mesh>

      {/* A continuous carpet runner makes the entrance-to-stage route readable.
          Its narrow width stays between the authoritative table islands. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, (aisleStart + aisleEnd) / 2]} receiveShadow>
        <planeGeometry args={[1.3, aisleEnd - aisleStart]} />
        <meshStandardMaterial color={HALL_PALETTE.aisle} roughness={1} />
      </mesh>
      {tableRows.slice(1).map((row, index) => (
        <mesh key={row} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, (row + tableRows[index]!) / 2]} receiveShadow>
          <planeGeometry args={[WIDTH - 4, 0.38]} />
          <meshStandardMaterial color={HALL_PALETTE.carpetWeave} roughness={1} />
        </mesh>
      ))}

      {/* Walls */}
      <mesh position={[CENTRE_X, HALL_SHELL.wallHeight / 2, HALL_SHELL.minZ - 0.2]} receiveShadow>
        <boxGeometry args={[WIDTH + 1, HALL_SHELL.wallHeight, 0.4]} />
        <meshStandardMaterial color={HALL_PALETTE.wall} roughness={0.9} />
      </mesh>
      <mesh position={[CENTRE_X, HALL_SHELL.wallHeight / 2, HALL_SHELL.maxZ + 0.2]} receiveShadow>
        <boxGeometry args={[WIDTH + 1, HALL_SHELL.wallHeight, 0.4]} />
        <meshStandardMaterial color={HALL_PALETTE.wall} roughness={0.9} />
      </mesh>
      <mesh position={[HALL_SHELL.minX - 0.2, HALL_SHELL.wallHeight / 2, CENTRE_Z]} receiveShadow>
        <boxGeometry args={[0.4, HALL_SHELL.wallHeight, DEPTH]} />
        <meshStandardMaterial color={HALL_PALETTE.wallSide} roughness={0.92} />
      </mesh>
      <mesh position={[HALL_SHELL.maxX + 0.2, HALL_SHELL.wallHeight / 2, CENTRE_Z]} receiveShadow>
        <boxGeometry args={[0.4, HALL_SHELL.wallHeight, DEPTH]} />
        <meshStandardMaterial color={HALL_PALETTE.wallSide} roughness={0.92} />
      </mesh>

      {/* Wainscoting and a gold band that catches the accent lights */}
      {[HALL_SHELL.minX + 0.02, HALL_SHELL.maxX - 0.02].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.55, CENTRE_Z]}>
            <boxGeometry args={[0.08, 1.1, DEPTH - 0.4]} />
            <meshStandardMaterial color={HALL_PALETTE.timber} roughness={0.72} />
          </mesh>
          <mesh position={[x, 1.16, CENTRE_Z]}>
            <boxGeometry args={[0.1, 0.06, DEPTH - 0.4]} />
            <meshStandardMaterial color={HALL_PALETTE.trim} roughness={0.36} metalness={0.72} />
          </mesh>
        </group>
      ))}

      {/*
        Ceiling.

        Seen almost edge-on from standing eye height and lit only by lamps
        pointing straight down, a dark ceiling crushes to pure black and the
        hall reads as a room with no roof — with the lamps floating in the void
        like paper aeroplanes. A faint emissive keeps it a surface at grazing
        angles without turning it into a light source.
      */}
      <mesh position={[CENTRE_X, HALL_SHELL.ceilingHeight, CENTRE_Z]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[WIDTH, DEPTH]} />
        <meshStandardMaterial
          color={HALL_PALETTE.ceiling}
          emissive={HALL_PALETTE.wallSide}
          emissiveIntensity={0.55}
          roughness={0.95}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Cove trim where wall meets ceiling: gives the roof an edge to read. */}
      {[HALL_SHELL.minZ + 0.3, HALL_SHELL.maxZ - 0.3].map((z) => (
        <mesh key={z} position={[CENTRE_X, HALL_SHELL.ceilingHeight - 0.14, z]}>
          <boxGeometry args={[WIDTH, 0.1, 0.14]} />
          <meshStandardMaterial color={HALL_PALETTE.trim} emissive={HALL_PALETTE.fill} emissiveIntensity={0.5} />
        </mesh>
      ))}

      {lampPositions.map((lamp) => (
        <CeilingLamp
          key={`${lamp.x}:${lamp.z}`}
          x={lamp.x}
          z={lamp.z}
          color={houseColor}
          intensity={mood.lightScale}
          withLight={lamp.lit}
        />
      ))}

      {/* Emergency strips only visible while the house lights are out */}
      {mood.emergencyLights && (
        <>
          {[-8.4, 8.4].map((x) => (
            <mesh key={x} position={[x, 0.06, CENTRE_Z]}>
              <boxGeometry args={[0.1, 0.02, DEPTH - 2]} />
              <meshBasicMaterial color="#ff4d4d" toneMapped={false} />
            </mesh>
          ))}
          <pointLight position={[0, 2.4, 2]} color="#ff5a5a" intensity={9} distance={16} />
        </>
      )}

      {/* Entrance: doors, canopy and the illuminated hall sign */}
      <group position={[ENTRANCE.x, 0, HALL_SHELL.maxZ - 0.05]}>
        <mesh position={[0, 1.15, 0]}>
          <boxGeometry args={[ENTRANCE.width, 2.3, 0.14]} />
          <meshStandardMaterial color="#150e1f" roughness={0.5} metalness={0.3} />
        </mesh>
        <mesh position={[0, 1.15, -0.02]}>
          <boxGeometry args={[ENTRANCE.width - 0.24, 2.1, 0.06]} />
          <meshStandardMaterial color="#0d1a24" roughness={0.16} metalness={0.5} transparent opacity={0.55} />
        </mesh>
        <mesh position={[0, 2.55, -0.2]}>
          <boxGeometry args={[ENTRANCE.width + 1.2, 0.5, 0.5]} />
          <meshStandardMaterial color="#3d1f4a" roughness={0.6} />
        </mesh>
        <Sign text="BINGOVERSE" position={[0, 2.55, -0.47]} rotationY={Math.PI} width={3.4} height={0.42} color="#ffd166" />
      </group>

      <ExitSign position={[HALL_SHELL.minX + 0.42, 2.5, 6.4]} rotationY={Math.PI / 2} />
      <ExitSign position={[HALL_SHELL.maxX - 0.42, 2.5, -4.6]} rotationY={-Math.PI / 2} />
      <ServiceDoor position={[HALL_SHELL.minX + 0.42, 0, 4.6]} rotationY={Math.PI / 2} />
      <ServiceDoor position={[HALL_SHELL.maxX - 0.42, 0, -2.4]} rotationY={-Math.PI / 2} />

      <AdPanel position={[HALL_SHELL.minX + 0.5, 2.6, -0.4]} rotationY={Math.PI / 2} reducedMotion={reducedMotion} />
      <AdPanel position={[HALL_SHELL.maxX - 0.5, 2.6, 2.6]} rotationY={-Math.PI / 2} reducedMotion={reducedMotion} />

      {/* Cloakroom niche next to the entrance */}
      <group position={[HALL_SHELL.minX + 1.4, 0, SPAWN.z + 0.6]}>
        <RoundedBox args={[2.4, 1.02, 0.6]} radius={0.06} smoothness={2} position={[0, 0.51, 0]} castShadow={shadows} receiveShadow>
          <meshStandardMaterial color="#3a2437" roughness={0.7} />
        </RoundedBox>
        <mesh position={[0, 1.9, -0.2]}>
          <boxGeometry args={[2.4, 0.05, 0.5]} />
          <meshStandardMaterial color={HALL_PALETTE.upholstery} roughness={0.75} />
        </mesh>
        {[-0.8, -0.3, 0.2, 0.7].map((offset) => (
          <mesh key={offset} position={[offset, 1.6, -0.2]} castShadow={shadows}>
            <capsuleGeometry args={[0.12, 0.5, 4, 8]} />
            <meshStandardMaterial color={offset > 0 ? '#5d4a7a' : '#7a4a4a'} roughness={0.9} />
          </mesh>
        ))}
        <Sign text="GUARDAROBA" position={[0, 1.28, 0.32]} width={1.4} height={0.2} color="#d9c7ff" />
      </group>

      {/* Riser lip in front of the stage so the platform reads as raised */}
      <mesh position={[0, STAGE.height / 2, STAGE.maxZ]} receiveShadow>
        <boxGeometry args={[STAGE.maxX - STAGE.minX, STAGE.height, 0.12]} />
        <meshStandardMaterial color="#5c2a3f" roughness={0.6} metalness={0.15} />
      </mesh>
    </group>
  );
}

export default BingoHallEnvironment;
