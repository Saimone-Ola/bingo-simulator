import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { AvatarAppearance, BingoPlayerSummary, ItalianBingoCard } from '@bingo/shared';
import ProceduralCharacter, {
  type CharacterAnimationState,
  type CharacterPersonality,
} from './ProceduralCharacter';

export interface BingoMarkInteraction {
  cellIndex: number;
  token: number;
}

interface BingoRoomSceneProps {
  card: ItalianBingoCard | undefined;
  cardIndex: number;
  currentNumber: number | null;
  drawnNumbers: number[];
  players: BingoPlayerSummary[];
  mySessionId: string;
  manualMarking: boolean;
  markerColor: string;
  focusCard: boolean;
  reducedMotion: boolean;
  lastMark: BingoMarkInteraction | null;
  onMarkCell: (cellIndex: number, marked: boolean) => void;
  onSelectMarker: (color: string) => void;
}

const MARKER_COLORS = ['#ef4444', '#2563eb', '#16a34a', '#7c3aed'] as const;
const CELL_WIDTH = 0.255;
const CELL_HEIGHT = 0.205;
const CARD_Y = 1.13;
const CARD_Z = 3.02;
const PLAYER_TABLE_RADIUS = 2.45;
const DEFAULT_APPEARANCE: AvatarAppearance = {
  bodyType: 'neutral',
  skinTone: '#e0b49a',
  hairStyle: 'short',
  hairColor: '#2b2118',
  shirtColor: '#8b7cf6',
  pantsColor: '#4a4585',
  heightCm: 175,
};

type Vector3Tuple = [number, number, number];

function CanvasText({
  text,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  color = '#ffffff',
  width = 1,
  height = 0.25,
  fontScale = 0.56,
  renderOrder = 2,
}: {
  text: string;
  position?: Vector3Tuple;
  rotation?: Vector3Tuple;
  color?: string;
  width?: number;
  height?: number;
  fontScale?: number;
  renderOrder?: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = color;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = `800 ${Math.round(canvas.height * fontScale)}px Inter, system-ui, sans-serif`;
      context.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * 0.94);
    }
    const next = new THREE.CanvasTexture(canvas);
    next.colorSpace = THREE.SRGBColorSpace;
    next.minFilter = THREE.LinearMipmapLinearFilter;
    next.magFilter = THREE.LinearFilter;
    next.anisotropy = 4;
    return next;
  }, [color, fontScale, text]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={position} rotation={rotation} renderOrder={renderOrder}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} depthTest={false} depthWrite={false} />
    </mesh>
  );
}

function RoomCameraController({ focusCard, reducedMotion }: { focusCard: boolean; reducedMotion: boolean }) {
  const { camera, gl } = useThree();
  const yawTarget = useRef(0);
  const pitchTarget = useRef(-0.08);
  const yawCurrent = useRef(0);
  const pitchCurrent = useRef(-0.08);
  const positionTarget = useRef(new THREE.Vector3(0, 1.7, 4.75));
  const dragging = useRef(false);
  const pointer = useRef({ x: 0, y: 0 });
  const keys = useRef(new Set<string>());

  useEffect(() => {
    camera.rotation.order = 'YXZ';
    camera.position.copy(positionTarget.current);
    const canvas = gl.domElement;
    const previousTouchAction = canvas.style.touchAction;
    const previousCursor = canvas.style.cursor;
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';

    const onPointerDown = (event: PointerEvent) => {
      dragging.current = true;
      pointer.current = { x: event.clientX, y: event.clientY };
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging.current || focusCard) return;
      const deltaX = event.clientX - pointer.current.x;
      const deltaY = event.clientY - pointer.current.y;
      pointer.current = { x: event.clientX, y: event.clientY };
      yawTarget.current = THREE.MathUtils.clamp(yawTarget.current - deltaX * 0.004, -1.45, 1.45);
      pitchTarget.current = THREE.MathUtils.clamp(pitchTarget.current - deltaY * 0.0035, -0.78, 0.38);
    };
    const stopDragging = (event: PointerEvent) => {
      dragging.current = false;
      canvas.style.cursor = 'grab';
      if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) {
        keys.current.add(event.code);
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => keys.current.delete(event.code);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', stopDragging);
    canvas.addEventListener('pointercancel', stopDragging);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', stopDragging);
      canvas.removeEventListener('pointercancel', stopDragging);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.style.touchAction = previousTouchAction;
      canvas.style.cursor = previousCursor;
    };
  }, [camera, focusCard, gl]);

  useFrame((_state, delta) => {
    const damping = reducedMotion ? 30 : 12;
    if (focusCard) {
      yawTarget.current = 0;
      pitchTarget.current = -0.43;
      positionTarget.current.set(0, 1.76, 4.6);
    } else {
      const lookSpeed = 1.15 * delta;
      if (keys.current.has('ArrowLeft') || keys.current.has('KeyQ')) yawTarget.current += lookSpeed;
      if (keys.current.has('ArrowRight') || keys.current.has('KeyE')) yawTarget.current -= lookSpeed;
      if (keys.current.has('ArrowUp')) pitchTarget.current += lookSpeed * 0.7;
      if (keys.current.has('ArrowDown')) pitchTarget.current -= lookSpeed * 0.7;

      const forward = Number(keys.current.has('KeyW')) - Number(keys.current.has('KeyS'));
      const strafe = Number(keys.current.has('KeyD')) - Number(keys.current.has('KeyA'));
      if (forward || strafe) {
        const speed = 1.2 * delta;
        const sin = Math.sin(yawCurrent.current);
        const cos = Math.cos(yawCurrent.current);
        positionTarget.current.x += (strafe * cos - forward * sin) * speed;
        positionTarget.current.z += (-forward * cos - strafe * sin) * speed;
      }

      // The player may move around the assigned circular station, but cannot
      // cross the table, chairs or leave the presentation-safe play area.
      positionTarget.current.x = THREE.MathUtils.clamp(positionTarget.current.x, -1.45, 1.45);
      positionTarget.current.z = THREE.MathUtils.clamp(positionTarget.current.z, 4.15, 5.85);
      const distanceFromTable = Math.hypot(positionTarget.current.x, positionTarget.current.z - 2.78);
      if (distanceFromTable < PLAYER_TABLE_RADIUS + 0.38) {
        const angle = Math.atan2(positionTarget.current.z - 2.78, positionTarget.current.x);
        positionTarget.current.x = Math.cos(angle) * (PLAYER_TABLE_RADIUS + 0.38);
        positionTarget.current.z = 2.78 + Math.sin(angle) * (PLAYER_TABLE_RADIUS + 0.38);
      }

      const gamepad = navigator.getGamepads?.()[0];
      if (gamepad) {
        const axisX = Math.abs(gamepad.axes[2] ?? 0) > 0.14 ? (gamepad.axes[2] ?? 0) : 0;
        const axisY = Math.abs(gamepad.axes[3] ?? 0) > 0.14 ? (gamepad.axes[3] ?? 0) : 0;
        yawTarget.current -= axisX * lookSpeed * 1.3;
        pitchTarget.current -= axisY * lookSpeed;
      }
      yawTarget.current = THREE.MathUtils.clamp(yawTarget.current, -1.45, 1.45);
      pitchTarget.current = THREE.MathUtils.clamp(pitchTarget.current, -0.78, 0.38);
    }

    yawCurrent.current = THREE.MathUtils.damp(yawCurrent.current, yawTarget.current, damping, delta);
    pitchCurrent.current = THREE.MathUtils.damp(pitchCurrent.current, pitchTarget.current, damping, delta);
    camera.position.x = THREE.MathUtils.damp(camera.position.x, positionTarget.current.x, damping, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, positionTarget.current.y, damping, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, positionTarget.current.z, damping, delta);
    camera.rotation.set(pitchCurrent.current, yawCurrent.current, 0);
  });

  return null;
}

const PERSONALITIES: CharacterPersonality[] = ['CALM', 'NERVOUS', 'LOUD', 'LUCKY', 'GRUMPY', 'DISTRACTED', 'PRANKSTER'];

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function guestAnimation(player: BingoPlayerSummary, currentNumber: number | null, drawnCount: number): CharacterAnimationState {
  if (currentNumber === null) return 'SEATED_IDLE';
  const reaction = (stableHash(player.sessionId) + drawnCount) % 11;
  if (reaction === 0) return 'CELEBRATE';
  if (reaction === 1) return 'LAUGH';
  if (reaction === 2) return 'TALK';
  if (reaction === 3) return 'DISAPPOINTED';
  if (reaction === 4 || reaction === 5) return 'MARK_NUMBER';
  return reaction % 2 === 0 ? 'LOOK_AT_CARD' : 'LOOK_AT_STAGE';
}

function cuteAppearance(appearance: AvatarAppearance | undefined, index: number): AvatarAppearance {
  const palettes = ['#9f8cff', '#ff8fb1', '#57d6c7', '#f2b75e', '#73a7ff'];
  return {
    ...(appearance ?? DEFAULT_APPEARANCE),
    shirtColor: appearance?.shirtColor ?? palettes[index % palettes.length] ?? '#9f8cff',
    heightCm: THREE.MathUtils.clamp(appearance?.heightCm ?? 170, 158, 182),
  };
}

function RoundChair({ angle, radius, color = '#423149' }: { angle: number; radius: number; color?: string }) {
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  return (
    <group position={[x, 0, z]} rotation={[0, -angle + Math.PI / 2, 0]}>
      <RoundedBox args={[0.78, 0.12, 0.78]} radius={0.12} smoothness={3} position={[0, 0.43, 0]} castShadow>
        <meshStandardMaterial color={color} roughness={0.78} />
      </RoundedBox>
      <RoundedBox args={[0.78, 0.84, 0.13]} radius={0.12} smoothness={3} position={[0, 0.88, 0.33]} castShadow>
        <meshStandardMaterial color={color} roughness={0.78} />
      </RoundedBox>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 0.45, 12]} />
        <meshStandardMaterial color="#1d1820" roughness={0.8} />
      </mesh>
    </group>
  );
}

function RoundBingoTable({
  position,
  players,
  phase,
  currentNumber,
  drawnCount,
  reducedMotion,
}: {
  position: readonly [number, number];
  players: BingoPlayerSummary[];
  phase: number;
  currentNumber: number | null;
  drawnCount: number;
  reducedMotion: boolean;
}) {
  const seats = 4;
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.38, 1.38, 0.15, 48]} />
        <meshStandardMaterial color="#6b4035" roughness={0.62} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.84, 0]} receiveShadow>
        <cylinderGeometry args={[1.24, 1.24, 0.025, 48]} />
        <meshStandardMaterial color="#30202a" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.38, 0.72, 28]} />
        <meshStandardMaterial color="#23171d" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.08, 24]} />
        <meshStandardMaterial color="#d6ad57" emissive="#6d4710" emissiveIntensity={0.22} />
      </mesh>
      {Array.from({ length: seats }, (_, index) => {
        const angle = Math.PI / 4 + index * ((Math.PI * 2) / seats);
        const player = players[index];
        const x = Math.cos(angle) * 1.88;
        const z = Math.sin(angle) * 1.88;
        return (
          <group key={index}>
            <RoundChair angle={angle} radius={1.95} />
            {player && (
              <ProceduralCharacter
                appearance={cuteAppearance(player.appearance, index)}
                state={guestAnimation(player, currentNumber, drawnCount)}
                personality={PERSONALITIES[stableHash(player.sessionId) % PERSONALITIES.length] ?? 'CALM'}
                position={[x, 0.08, z]}
                rotationY={-angle - Math.PI / 2}
                scale={0.76}
                phase={phase + index * 0.37}
                reducedMotion={reducedMotion}
                seated
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

function RoomShell({ players, mySessionId, currentNumber, drawnCount, reducedMotion }: {
  players: BingoPlayerSummary[];
  mySessionId: string;
  currentNumber: number | null;
  drawnCount: number;
  reducedMotion: boolean;
}) {
  const visiblePlayers = useMemo(() => players.filter((player) => player.sessionId !== mySessionId), [mySessionId, players]);
  const tables = useMemo(() => [[-5.2, -0.8], [0, -1.1], [5.2, -0.8], [-3.6, -4.9], [3.6, -4.9]] as const, []);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[22, 28]} />
        <meshStandardMaterial color="#241a26" roughness={0.78} metalness={0.08} />
      </mesh>
      <mesh position={[0, 3, -10.2]} receiveShadow><boxGeometry args={[20, 6, 0.35]} /><meshStandardMaterial color="#2e1932" roughness={0.82} /></mesh>
      <mesh position={[-9.7, 3, 0]} receiveShadow><boxGeometry args={[0.35, 6, 21]} /><meshStandardMaterial color="#20172a" roughness={0.86} /></mesh>
      <mesh position={[9.7, 3, 0]} receiveShadow><boxGeometry args={[0.35, 6, 21]} /><meshStandardMaterial color="#20172a" roughness={0.86} /></mesh>
      <mesh position={[0, 6.05, 0]}><boxGeometry args={[20, 0.2, 21]} /><meshStandardMaterial color="#17111f" roughness={0.9} /></mesh>
      <group position={[0, 0, -7.9]}>
        <RoundedBox args={[8.4, 0.55, 3.1]} radius={0.22} smoothness={3} position={[0, 0.25, 0]} receiveShadow castShadow><meshStandardMaterial color="#4a2634" roughness={0.65} /></RoundedBox>
        <mesh position={[0, 1.32, -1.28]} receiveShadow><boxGeometry args={[8.8, 2.2, 0.22]} /><meshStandardMaterial color="#6d1f46" roughness={0.72} /></mesh>
      </group>
      {tables.map((position, tableIndex) => (
        <RoundBingoTable
          key={tableIndex}
          position={position}
          players={visiblePlayers.slice(tableIndex * 4, tableIndex * 4 + 4)}
          phase={tableIndex * 0.73}
          currentNumber={currentNumber}
          drawnCount={drawnCount}
          reducedMotion={reducedMotion}
        />
      ))}
      {[-6.3, -2.1, 2.1, 6.3].map((x) => (
        <group key={x} position={[x, 5.72, -0.8]}>
          <mesh><cylinderGeometry args={[0.16, 0.22, 0.16, 16]} /><meshStandardMaterial color="#a78bfa" emissive="#6d28d9" emissiveIntensity={1.2} /></mesh>
          <pointLight color="#8b5cf6" intensity={15} distance={6} decay={2} />
        </group>
      ))}
    </>
  );
}

function Stage({ currentNumber, drawnCount, reducedMotion }: { currentNumber: number | null; drawnCount: number; reducedMotion: boolean }) {
  const hostAppearance: AvatarAppearance = { bodyType: 'athletic', skinTone: '#b97f64', hairStyle: 'short', hairColor: '#33252b', shirtColor: '#6f61ad', pantsColor: '#24213f', heightCm: 178 };
  return (
    <group>
      <group position={[0, 3.6, -9.78]}>
        <RoundedBox args={[5.8, 2.1, 0.18]} radius={0.18} smoothness={3}><meshStandardMaterial color="#100c1b" metalness={0.45} roughness={0.3} emissive="#1d1233" emissiveIntensity={0.45} /></RoundedBox>
        <CanvasText text="NUMERO ESTRATTO" position={[0, 0.62, 0.12]} color="#c4b5fd" width={3.2} height={0.34} fontScale={0.42} />
        <CanvasText text={currentNumber?.toString() ?? '—'} position={[0, -0.08, 0.13]} color="#ffd166" width={2.1} height={1.05} fontScale={0.78} />
        <CanvasText text={`${drawnCount} / 90`} position={[0, -0.78, 0.12]} color="#8ee8de" width={2.2} height={0.28} fontScale={0.46} />
      </group>
      <group position={[1.25, 0.72, -7.8]}>
        <mesh position={[0, 0.58, 0]} castShadow><cylinderGeometry args={[1.15, 1.15, 0.18, 42]} /><meshStandardMaterial color="#5a332d" roughness={0.62} /></mesh>
        <ProceduralCharacter appearance={hostAppearance} state={currentNumber === null ? 'IDLE' : drawnCount % 4 === 0 ? 'TALK' : 'LOOK_AT_STAGE'} personality="LOUD" position={[0, 0.08, -0.12]} rotationY={0} scale={0.79} phase={1.7} reducedMotion={reducedMotion} />
      </group>
    </group>
  );
}

function PlayerTable({ cardCount, selectedCard }: { cardCount: number; selectedCard: number }) {
  return (
    <group position={[0, 0, 2.78]}>
      <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[PLAYER_TABLE_RADIUS, PLAYER_TABLE_RADIUS, 0.18, 64]} />
        <meshStandardMaterial color="#5d382f" roughness={0.58} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.86, 0]} receiveShadow>
        <cylinderGeometry args={[2.25, 2.25, 0.028, 64]} />
        <meshStandardMaterial color="#302029" roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.34, 0]} castShadow><cylinderGeometry args={[0.28, 0.54, 0.72, 32]} /><meshStandardMaterial color="#21161a" roughness={0.82} /></mesh>
      <mesh position={[0, 0.91, -0.18]}><cylinderGeometry args={[0.3, 0.3, 0.06, 24]} /><meshStandardMaterial color="#d5aa5b" roughness={0.5} /></mesh>
      <CanvasText text={`${Math.max(1, cardCount)} CARTELLE AL TAVOLO`} position={[0, 0.96, -0.18]} rotation={[-Math.PI / 2, 0, 0]} color="#38210f" width={1.35} height={0.18} fontScale={0.4} />
      <RoundChair angle={Math.PI / 2} radius={3.05} color="#49384f" />
      <pointLight position={[0, 2.1, 0]} color="#ffd7a0" intensity={4.5} distance={5} />
      {Array.from({ length: Math.min(6, Math.max(1, cardCount)) }, (_, index) => {
        const count = Math.min(6, Math.max(1, cardCount));
        const angle = count === 1 ? 0 : (index - (count - 1) / 2) * 0.2;
        const radius = count <= 3 ? 0.85 : 1.1;
        const x = Math.sin(angle) * radius * 2.1;
        const z = -0.15 + Math.cos(angle) * radius * 0.28;
        const active = index === selectedCard;
        return (
          <group key={index} position={[x, 0.91 + (active ? 0.025 : 0), z]} rotation={[-Math.PI / 2, 0, -angle]}>
            <RoundedBox args={[1.25, 0.48, 0.025]} radius={0.035} smoothness={2} castShadow receiveShadow>
              <meshStandardMaterial color={active ? '#fff1bf' : '#e7dcc1'} emissive={active ? '#9b6713' : '#000'} emissiveIntensity={active ? 0.14 : 0} roughness={0.75} />
            </RoundedBox>
            <CanvasText text={`C${index + 1}`} position={[-0.48, 0, 0.02]} color={active ? '#7a4305' : '#6b5434'} width={0.18} height={0.12} fontScale={0.56} />
            {Array.from({ length: 9 }, (_, column) => (
              <mesh key={column} position={[-0.35 + column * 0.09, 0, 0.022]}>
                <planeGeometry args={[0.065, 0.3]} />
                <meshBasicMaterial color={column % 2 === 0 ? '#fffaf0' : '#eadfca'} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function InteractiveMarker({ color, position, selected, onSelect }: { color: string; position: [number, number, number]; selected: boolean; onSelect: (color: string) => void }) {
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const { gl } = useThree();
  useFrame((_state, delta) => {
    if (!group.current) return;
    const targetY = position[1] + (selected ? 0.075 : hovered ? 0.04 : 0);
    group.current.position.y = THREE.MathUtils.damp(group.current.position.y, targetY, 14, delta);
    const targetScale = selected ? 1.08 : hovered ? 1.04 : 1;
    const scale = THREE.MathUtils.damp(group.current.scale.x, targetScale, 14, delta);
    group.current.scale.setScalar(scale);
  });
  return (
    <group ref={group} position={position} rotation={[0, 0, Math.PI / 2]}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); gl.domElement.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); gl.domElement.style.cursor = 'grab'; }}
      onPointerDown={(event) => { event.stopPropagation(); onSelect(color); }}>
      <mesh castShadow><cylinderGeometry args={[0.045, 0.045, 0.45, 16]} /><meshStandardMaterial color={color} roughness={0.42} metalness={0.08} /></mesh>
      <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.06, 0.05, 0.08, 16]} /><meshStandardMaterial color="#14121b" roughness={0.7} /></mesh>
      {selected && <pointLight position={[0, 0, 0.12]} color={color} intensity={2.5} distance={0.8} />}
    </group>
  );
}

function MarkerTray({ selectedColor, onSelect }: { selectedColor: string; onSelect: (color: string) => void }) {
  return (
    <group>
      <RoundedBox args={[1.85, 0.06, 0.42]} radius={0.08} smoothness={2} position={[1.18, 0.93, 2.18]} receiveShadow><meshStandardMaterial color="#17131e" roughness={0.65} /></RoundedBox>
      {MARKER_COLORS.map((color, index) => <InteractiveMarker key={color} color={color} position={[0.68 + index * 0.35, 1.01, 2.18]} selected={selectedColor === color} onSelect={onSelect} />)}
    </group>
  );
}

function ItalianCard3D({ card, cardIndex, drawn, manualMarking, markerColor, onMarkCell }: {
  card: ItalianBingoCard;
  cardIndex: number;
  drawn: ReadonlySet<number>;
  manualMarking: boolean;
  markerColor: string;
  onMarkCell: (cellIndex: number, marked: boolean) => void;
}) {
  const marked = useMemo(() => new Set(card.markedIndices), [card.markedIndices]);
  const { gl } = useThree();
  return (
    <group position={[0, CARD_Y, CARD_Z]} rotation={[-Math.PI / 2 + 0.18, 0, 0]}>
      <RoundedBox args={[2.65, 1.03, 0.045]} radius={0.055} smoothness={2} position={[0, 0.02, -0.02]} receiveShadow castShadow><meshStandardMaterial color="#efe4c8" roughness={0.72} /></RoundedBox>
      <CanvasText text={`CARTELLA ${cardIndex + 1}`} position={[0, 0.43, 0.04]} color="#5e4426" width={1.75} height={0.14} fontScale={0.48} />
      {card.cells.map((number, cellIndex) => {
        const row = Math.floor(cellIndex / 9);
        const column = cellIndex % 9;
        const x = (column - 4) * (CELL_WIDTH + 0.012);
        const y = (1 - row) * (CELL_HEIGHT + 0.012) - 0.075;
        const isMarked = marked.has(cellIndex);
        const isDrawn = number !== null && drawn.has(number);
        const wrong = isMarked && !isDrawn;
        return (
          <group key={cellIndex} position={[x, y, 0.026]}>
            <mesh castShadow receiveShadow
              onPointerOver={(event) => { if (number === null || !manualMarking) return; event.stopPropagation(); gl.domElement.style.cursor = 'pointer'; }}
              onPointerOut={() => { gl.domElement.style.cursor = 'grab'; }}
              onPointerDown={(event: ThreeEvent<PointerEvent>) => { if (number === null || !manualMarking) return; event.stopPropagation(); onMarkCell(cellIndex, !isMarked); }}>
              <boxGeometry args={[CELL_WIDTH, CELL_HEIGHT, 0.038]} />
              <meshStandardMaterial color={number === null ? '#d5c7a7' : isDrawn ? '#fff1b5' : '#fffaf0'} emissive={isDrawn ? '#b46a10' : '#000000'} emissiveIntensity={isDrawn ? 0.18 : 0} roughness={0.68} />
            </mesh>
            {number !== null && <CanvasText text={number.toString()} position={[0, 0, 0.052]} color="#2b2115" width={0.19} height={0.13} fontScale={0.62} renderOrder={4} />}
            {isMarked && <mesh position={[0, 0, 0.048]} renderOrder={5}><torusGeometry args={[0.07, 0.011, 10, 28]} /><meshBasicMaterial color={wrong ? '#ef4444' : markerColor} transparent opacity={0.82} depthTest={false} /></mesh>}
          </group>
        );
      })}
    </group>
  );
}

function FirstPersonHands({ markerColor, lastMark, reducedMotion, appearance }: { markerColor: string; lastMark: BingoMarkInteraction | null; reducedMotion: boolean; appearance: AvatarAppearance }) {
  const rightHand = useRef<THREE.Group>(null);
  const animationStart = useRef(0);
  useEffect(() => { animationStart.current = performance.now() / 1_000; }, [lastMark?.token]);
  useFrame((_state, delta) => {
    if (!rightHand.current) return;
    const elapsed = performance.now() / 1_000 - animationStart.current;
    const active = Boolean(lastMark) && elapsed >= 0 && elapsed < 0.62 && !reducedMotion;
    const row = lastMark ? Math.floor(lastMark.cellIndex / 9) : 1;
    const column = lastMark ? lastMark.cellIndex % 9 : 7;
    const cardX = (column - 4) * (CELL_WIDTH + 0.012);
    const localY = (1 - row) * (CELL_HEIGHT + 0.012) - 0.075;
    const cardWorldZ = CARD_Z - localY;
    const arc = active ? Math.sin((elapsed / 0.62) * Math.PI) : 0;
    rightHand.current.position.x = THREE.MathUtils.damp(rightHand.current.position.x, active ? cardX + 0.1 : 1.5, 18, delta);
    rightHand.current.position.y = THREE.MathUtils.damp(rightHand.current.position.y, active ? CARD_Y + 0.18 + arc * 0.1 : 1.05, 18, delta);
    rightHand.current.position.z = THREE.MathUtils.damp(rightHand.current.position.z, active ? cardWorldZ + 0.12 : 4.04, 18, delta);
  });
  return (
    <>
      <group position={[-1.5, 1.02, 4.04]} rotation={[0.16, -0.2, -0.12]}><mesh castShadow><capsuleGeometry args={[0.105, 0.4, 6, 12]} /><meshStandardMaterial color={appearance.skinTone} roughness={0.84} /></mesh><mesh position={[0, -0.28, 0]}><cylinderGeometry args={[0.13, 0.17, 0.3, 16]} /><meshStandardMaterial color={appearance.shirtColor} roughness={0.76} /></mesh></group>
      <group ref={rightHand} position={[1.5, 1.05, 4.04]} rotation={[0.22, 0.18, 0.12]}><mesh castShadow><capsuleGeometry args={[0.105, 0.4, 6, 12]} /><meshStandardMaterial color={appearance.skinTone} roughness={0.84} /></mesh><mesh position={[0, -0.28, 0]}><cylinderGeometry args={[0.13, 0.17, 0.3, 16]} /><meshStandardMaterial color={appearance.shirtColor} roughness={0.76} /></mesh><mesh position={[-0.02, 0.23, -0.04]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.027, 0.027, 0.42, 12]} /><meshStandardMaterial color={markerColor} roughness={0.45} /></mesh></group>
    </>
  );
}

function Scene(props: BingoRoomSceneProps) {
  const drawn = useMemo(() => new Set(props.drawnNumbers), [props.drawnNumbers]);
  const me = props.players.find((player) => player.sessionId === props.mySessionId);
  const myAppearance = me?.appearance ?? DEFAULT_APPEARANCE;
  return (
    <>
      <color attach="background" args={['#0f0b18']} />
      <fog attach="fog" args={['#17101f', 12, 26]} />
      <ambientLight intensity={0.78} color="#a99be1" />
      <hemisphereLight args={['#ffe0b8', '#23152a', 1.32]} />
      <directionalLight position={[2.5, 6.8, 4.5]} intensity={2.2} color="#ffd7a0" castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-near={1} shadow-camera-far={18} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={7} shadow-camera-bottom={-7} />
      <RoomCameraController focusCard={props.focusCard} reducedMotion={props.reducedMotion} />
      <RoomShell players={props.players} mySessionId={props.mySessionId} currentNumber={props.currentNumber} drawnCount={props.drawnNumbers.length} reducedMotion={props.reducedMotion} />
      <Stage currentNumber={props.currentNumber} drawnCount={props.drawnNumbers.length} reducedMotion={props.reducedMotion} />
      <PlayerTable cardCount={me?.cardCount ?? (props.card ? 1 : 0)} selectedCard={props.cardIndex} />
      {props.card && <ItalianCard3D card={props.card} cardIndex={props.cardIndex} drawn={drawn} manualMarking={props.manualMarking} markerColor={props.markerColor} onMarkCell={props.onMarkCell} />}
      <MarkerTray selectedColor={props.markerColor} onSelect={props.onSelectMarker} />
      <FirstPersonHands markerColor={props.markerColor} lastMark={props.lastMark} reducedMotion={props.reducedMotion} appearance={myAppearance} />
    </>
  );
}

export default function BingoRoomScene(props: BingoRoomSceneProps) {
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 1.7, 4.75], fov: 58, near: 0.08, far: 45 }} gl={{ antialias: true, powerPreference: 'high-performance' }} performance={{ min: 0.55 }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.08; }}>
      <Scene {...props} />
    </Canvas>
  );
}
