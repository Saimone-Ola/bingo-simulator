import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { SlotMachineSummary } from '@bingo/shared';
import { SceneBoundary } from '../../components/SceneBoundary';
import { labelTexture } from '../bingo/textures';
import { attachKeyboard, readMoveAxes } from '../../net/input';
import { createMovementState, damp, dampAngle, stepMovement } from '../bingo/movement';
import {
  ARCADE_BOUNDS,
  ARCADE_COLLIDERS,
  ARCADE_SHELL,
  ARCADE_SPAWN,
  nearestCabinet,
  occupiedCabinets,
  type CabinetPlacement,
} from './arcadeLayout';
import { RENDER_PROFILES, type HallQuality } from '../../store/hallSettings';

/**
 * The slot arcade.
 *
 * Same first person model as the Bingo hall — walk up to a machine, press E,
 * play — and the same movement maths, which lives in `bingo/movement.ts` and
 * takes its colliders as an argument precisely so a second room can use it
 * without a line of it being copied.
 */

const EYE_HEIGHT = 1.62;
const CABINET_WIDTH = 1.15;
const CABINET_HEIGHT = 2.05;
const CABINET_DEPTH = 0.62;

/** One arcade cabinet: body, screen, marquee, button deck and its glow. */
function SlotCabinet({
  cabinet,
  machine,
  active,
  reducedMotion,
  shadows,
}: {
  cabinet: CabinetPlacement;
  machine: SlotMachineSummary | undefined;
  active: boolean;
  reducedMotion: boolean;
  shadows: boolean;
}) {
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const accent = machine?.isMine ? '#f6c453' : machine ? '#7c5cff' : '#3d3556';

  const marquee = useMemo(
    () =>
      labelTexture(machine?.name ?? 'FUORI SERVIZIO', {
        color: machine ? '#0f0a1c' : '#8a80a8',
        background: machine ? (machine.isMine ? '#f6c453' : '#a78bfa') : '#221c33',
        fontScale: 0.4,
        width: 512,
        height: 128,
      }),
    [machine],
  );

  const screen = useMemo(() => {
    if (!machine) return labelTexture('—', { color: '#4a4266', fontScale: 0.5, width: 512, height: 512 });
    return labelTexture(`RTP ${((machine.rtpSimulated ?? machine.rtpTheoretical ?? 0) * 100).toFixed(1)}%`, {
      color: '#8ee8de',
      background: '#0d0918',
      fontScale: 0.22,
      width: 512,
      height: 512,
    });
  }, [machine]);

  useFrame(({ clock }) => {
    if (!glow.current) return;
    const base = active ? 1.4 : machine ? 0.45 : 0.1;
    glow.current.emissiveIntensity =
      base + (reducedMotion ? 0 : Math.sin(clock.elapsedTime * 2.4 + cabinet.index) * 0.12);
  });

  return (
    <group position={[cabinet.x, 0, cabinet.z]} rotation={[0, cabinet.facing, 0]}>
      {/* Body, tilted control deck, screen bezel */}
      <RoundedBox
        args={[CABINET_WIDTH, CABINET_HEIGHT, CABINET_DEPTH]}
        radius={0.06}
        smoothness={2}
        position={[0, CABINET_HEIGHT / 2, 0]}
        castShadow={shadows}
        receiveShadow
      >
        <meshStandardMaterial color="#3d2f63" roughness={0.62} metalness={0.15} />
      </RoundedBox>
      <mesh position={[0, 1.4, CABINET_DEPTH / 2 + 0.005]}>
        <planeGeometry args={[CABINET_WIDTH - 0.16, 0.78]} />
        {screen ? (
          <meshBasicMaterial map={screen} toneMapped={false} />
        ) : (
          <meshBasicMaterial color="#0d0918" />
        )}
      </mesh>
      <mesh position={[0, 1.4, CABINET_DEPTH / 2 + 0.002]}>
        <planeGeometry args={[CABINET_WIDTH - 0.08, 0.86]} />
        <meshStandardMaterial color="#0a0714" roughness={0.3} metalness={0.5} />
      </mesh>

      {/* Marquee above the screen */}
      <mesh position={[0, 1.95, CABINET_DEPTH / 2 + 0.01]}>
        <planeGeometry args={[CABINET_WIDTH - 0.06, 0.3]} />
        {marquee ? (
          <meshBasicMaterial map={marquee} toneMapped={false} />
        ) : (
          <meshBasicMaterial color={accent} />
        )}
      </mesh>

      {/* Control deck and the spin button */}
      <RoundedBox
        args={[CABINET_WIDTH, 0.16, 0.42]}
        radius={0.04}
        smoothness={2}
        position={[0, 0.98, CABINET_DEPTH / 2 + 0.12]}
        rotation={[-0.32, 0, 0]}
        castShadow={shadows}
      >
        <meshStandardMaterial color="#2e2350" roughness={0.55} metalness={0.2} />
      </RoundedBox>
      <mesh position={[0, 1.02, CABINET_DEPTH / 2 + 0.2]} rotation={[-0.32, 0, 0]}>
        <cylinderGeometry args={[0.075, 0.075, 0.05, 16]} />
        <meshStandardMaterial color="#e2434f" emissive="#e2434f" emissiveIntensity={active ? 1.1 : 0.3} />
      </mesh>

      {/* Side light strips: the arcade's whole atmosphere is these. Drawn on
          both faces, because a cabinet in the left bank is only ever seen from
          the side the plane's normal points away from. */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * (CABINET_WIDTH / 2 + 0.01), 1.2, 0]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <planeGeometry args={[0.14, 1.55]} />
          <meshStandardMaterial
            ref={side === -1 ? glow : null}
            color={accent}
            emissive={accent}
            emissiveIntensity={0.5}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
      {active && (
        <pointLight position={[0, 1.5, 1.1]} color={accent} intensity={14} distance={4.5} />
      )}
    </group>
  );
}

function ArcadeRoom({ accentLights }: { accentLights: number }) {
  const width = ARCADE_SHELL.maxX - ARCADE_SHELL.minX;
  const depth = ARCADE_SHELL.maxZ - ARCADE_SHELL.minZ;
  const centreZ = (ARCADE_SHELL.maxZ + ARCADE_SHELL.minZ) / 2;
  const sign = useMemo(
    () => labelTexture('ARCADE SLOT', { color: '#f6c453', fontScale: 0.5 }),
    [],
  );

  const lamps = useMemo(() => {
    const positions: Array<{ x: number; z: number; lit: boolean }> = [];
    let index = 0;
    for (const z of [-6.5, -2, 2.5, 6]) {
      for (const x of [-4, 4]) {
        positions.push({ x, z, lit: index < accentLights });
        index += 1;
      }
    }
    return positions;
  }, [accentLights]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, centreZ]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#2a1f47" roughness={0.88} />
      </mesh>
      {/* Runner down the middle so the aisle reads as a route, not a gap. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, centreZ]} receiveShadow>
        <planeGeometry args={[4.4, depth - 1]} />
        <meshStandardMaterial color="#3b2b63" roughness={0.92} />
      </mesh>

      {[
        [0, ARCADE_SHELL.minZ - 0.2, width + 1, 0.4],
        [0, ARCADE_SHELL.maxZ + 0.2, width + 1, 0.4],
      ].map(([x, z, sx, sz]) => (
        <mesh key={`${z}`} position={[x ?? 0, ARCADE_SHELL.wallHeight / 2, z ?? 0]} receiveShadow>
          <boxGeometry args={[sx ?? 1, ARCADE_SHELL.wallHeight, sz ?? 1]} />
          <meshStandardMaterial color="#2b1f4d" roughness={0.9} />
        </mesh>
      ))}
      {[ARCADE_SHELL.minX - 0.2, ARCADE_SHELL.maxX + 0.2].map((x) => (
        <mesh key={x} position={[x, ARCADE_SHELL.wallHeight / 2, centreZ]} receiveShadow>
          <boxGeometry args={[0.4, ARCADE_SHELL.wallHeight, depth]} />
          <meshStandardMaterial color="#241a44" roughness={0.92} />
        </mesh>
      ))}
      <mesh position={[0, ARCADE_SHELL.ceilingHeight, centreZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#1a1233" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>

      {sign && (
        <mesh position={[0, 3.5, ARCADE_SHELL.minZ + 0.05]}>
          <planeGeometry args={[5.4, 0.8]} />
          <meshBasicMaterial map={sign} transparent toneMapped={false} />
        </mesh>
      )}

      {lamps.map((lamp) => (
        <group key={`${lamp.x}:${lamp.z}`} position={[lamp.x, ARCADE_SHELL.ceilingHeight - 0.3, lamp.z]}>
          <mesh>
            <boxGeometry args={[1.6, 0.06, 0.16]} />
            <meshStandardMaterial color="#c4a2ff" emissive="#8b5cf6" emissiveIntensity={1.6} toneMapped={false} />
          </mesh>
          {lamp.lit && <pointLight color="#a78bfa" intensity={30} distance={14} decay={1.7} />}
        </group>
      ))}
    </group>
  );
}

/** Walk, look, and report which cabinet is within reach. */
function ArcadeController({
  inputEnabled,
  machineCount,
  onNearCabinet,
  onInteract,
}: {
  inputEnabled: boolean;
  machineCount: number;
  onNearCabinet: (cabinet: CabinetPlacement | null) => void;
  onInteract: () => void;
}) {
  const { camera, gl } = useThree();
  const movement = useMemo(() => createMovementState(ARCADE_SPAWN.x, ARCADE_SPAWN.z), []);
  const yaw = useRef<number>(ARCADE_SPAWN.yaw);
  const yawTarget = useRef<number>(ARCADE_SPAWN.yaw);
  const pitch = useRef(-0.04);
  const pitchTarget = useRef(-0.04);
  const near = useRef<CabinetPlacement | null>(null);
  const enabledRef = useRef(inputEnabled);
  const countRef = useRef(machineCount);
  countRef.current = machineCount;
  const nearRef = useRef(onNearCabinet);
  const interactRef = useRef(onInteract);
  enabledRef.current = inputEnabled;
  nearRef.current = onNearCabinet;
  interactRef.current = onInteract;

  useEffect(() => attachKeyboard(), []);
  useEffect(() => {
    camera.rotation.order = 'YXZ';
  }, [camera]);

  useEffect(() => {
    const canvas = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const look = (dx: number, dy: number) => {
      if (!enabledRef.current) return;
      yawTarget.current -= dx * 0.0024;
      pitchTarget.current = THREE.MathUtils.clamp(pitchTarget.current - dy * 0.0024, -0.9, 0.6);
    };
    const down = (event: PointerEvent) => {
      if ((event.target as HTMLElement)?.dataset.joystick === 'true') return;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const move = (event: PointerEvent) => {
      if (document.pointerLockElement === canvas) return look(event.movementX, event.movementY);
      if (!dragging) return;
      look(event.clientX - lastX, event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const up = () => {
      dragging = false;
    };
    const key = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      if (element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) return;
      if (event.code === 'KeyE' && enabledRef.current) {
        event.preventDefault();
        interactRef.current();
      }
    };

    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    };
  }, [gl]);

  useFrame((_state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const axes = enabledRef.current ? readMoveAxes() : { forward: 0, right: 0, run: false };

    stepMovement(
      movement,
      { forward: axes.forward, strafe: axes.right, yaw: yaw.current, sprint: axes.run },
      delta,
      ARCADE_COLLIDERS,
      ARCADE_BOUNDS,
    );

    yaw.current = dampAngle(yaw.current, yawTarget.current, 16, delta);
    pitch.current = damp(pitch.current, pitchTarget.current, 16, delta);
    camera.position.set(movement.x, EYE_HEIGHT, movement.z);
    camera.rotation.set(pitch.current, yaw.current, 0);

    const cabinet = nearestCabinet(movement.x, movement.z, countRef.current);
    if (cabinet?.index !== near.current?.index) {
      near.current = cabinet;
      nearRef.current(cabinet);
    }
  });

  return null;
}

export interface ArcadeSceneProps {
  machines: readonly SlotMachineSummary[];
  activeCabinet: number | null;
  inputEnabled: boolean;
  quality: HallQuality;
  shadows: boolean;
  reducedMotion: boolean;
  onNearCabinet: (cabinet: CabinetPlacement | null) => void;
  onInteract: () => void;
  onSceneError?: (error: Error) => void;
}

function Scene(props: ArcadeSceneProps) {
  const profile = RENDER_PROFILES[props.quality];

  return (
    <>
      <color attach="background" args={['#0a0714']} />
      <fog attach="fog" args={['#1b1236', 12, 34]} />
      <ambientLight intensity={0.78} color="#b9a8ff" />
      <hemisphereLight args={['#d9c8ff', '#2a1c4a', 1.35]} />
      <directionalLight
        position={[3, 8, 6]}
        intensity={1.5}
        color="#e8dcff"
        castShadow={props.shadows}
        shadow-mapSize-width={profile.shadowMapSize}
        shadow-mapSize-height={profile.shadowMapSize}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.0006}
      />

      <ArcadeController
        inputEnabled={props.inputEnabled}
        machineCount={props.machines.length}
        onNearCabinet={props.onNearCabinet}
        onInteract={props.onInteract}
      />
      <ArcadeRoom accentLights={profile.accentLights} />

      {/* Only the cabinets that have a machine. An empty pitch drawn as a dead
          box is worse than an empty pitch. */}
      {occupiedCabinets(props.machines.length).map((cabinet) => (
        <SlotCabinet
          key={cabinet.index}
          cabinet={cabinet}
          machine={props.machines[cabinet.index]}
          active={props.activeCabinet === cabinet.index}
          reducedMotion={props.reducedMotion}
          shadows={props.shadows}
        />
      ))}
    </>
  );
}

export default function ArcadeScene(props: ArcadeSceneProps) {
  const profile = RENDER_PROFILES[props.quality];
  return (
    <SceneBoundary {...(props.onSceneError ? { onError: props.onSceneError } : {})}>
      <Canvas
        shadows={props.shadows ? 'percentage' : false}
        dpr={[profile.dpr[0], profile.dpr[1]]}
        camera={{ position: [0, EYE_HEIGHT, 7], fov: 62, near: 0.06, far: 45 }}
        gl={{ antialias: profile.antialias, powerPreference: 'high-performance' }}
        performance={{ min: 0.45 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <Suspense fallback={null}>
          <Scene {...props} />
        </Suspense>
      </Canvas>
    </SceneBoundary>
  );
}
