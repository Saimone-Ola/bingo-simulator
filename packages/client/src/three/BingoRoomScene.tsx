import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { BingoPlayerSummary, ItalianBingoCard } from '@bingo/shared';

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
  manualMarking: boolean;
  markerColor: string;
  focusCard: boolean;
  reducedMotion: boolean;
  lastMark: BingoMarkInteraction | null;
  onMarkCell: (cellIndex: number, marked: boolean) => void;
  onSelectMarker: (color: string) => void;
}

const MARKER_COLORS = ['#ef4444', '#2563eb', '#16a34a', '#7c3aed'] as const;
const CELL_WIDTH = 0.33;
const CELL_HEIGHT = 0.26;
const CARD_Y = 1.08;
const CARD_Z = 3.35;

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
      <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function SeatedCameraController({
  focusCard,
  reducedMotion,
}: {
  focusCard: boolean;
  reducedMotion: boolean;
}) {
  const { camera, gl } = useThree();
  const yawTarget = useRef(0);
  const pitchTarget = useRef(-0.06);
  const yawCurrent = useRef(0);
  const pitchCurrent = useRef(-0.06);
  const dragging = useRef(false);
  const pointer = useRef({ x: 0, y: 0 });
  const keys = useRef(new Set<string>());

  useEffect(() => {
    camera.rotation.order = 'YXZ';
    camera.position.set(0, 1.68, 4.65);

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
      yawTarget.current = THREE.MathUtils.clamp(
        yawTarget.current - deltaX * 0.004,
        -1.28,
        1.28,
      );
      pitchTarget.current = THREE.MathUtils.clamp(
        pitchTarget.current - deltaY * 0.0035,
        -0.88,
        0.42,
      );
    };
    const stopDragging = (event: PointerEvent) => {
      dragging.current = false;
      canvas.style.cursor = 'grab';
      if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
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
    const turnSpeed = 1.1 * delta;
    if (!focusCard) {
      if (keys.current.has('ArrowLeft') || keys.current.has('KeyA')) yawTarget.current += turnSpeed;
      if (keys.current.has('ArrowRight') || keys.current.has('KeyD')) yawTarget.current -= turnSpeed;
      if (keys.current.has('ArrowUp') || keys.current.has('KeyW')) pitchTarget.current += turnSpeed * 0.7;
      if (keys.current.has('ArrowDown') || keys.current.has('KeyS')) pitchTarget.current -= turnSpeed * 0.7;

      const gamepad = navigator.getGamepads?.()[0];
      if (gamepad) {
        const axisX = Math.abs(gamepad.axes[2] ?? 0) > 0.14 ? (gamepad.axes[2] ?? 0) : 0;
        const axisY = Math.abs(gamepad.axes[3] ?? 0) > 0.14 ? (gamepad.axes[3] ?? 0) : 0;
        yawTarget.current -= axisX * turnSpeed * 1.3;
        pitchTarget.current -= axisY * turnSpeed;
      }
      yawTarget.current = THREE.MathUtils.clamp(yawTarget.current, -1.28, 1.28);
      pitchTarget.current = THREE.MathUtils.clamp(pitchTarget.current, -0.88, 0.42);
    } else {
      yawTarget.current = 0;
      pitchTarget.current = -0.41;
    }

    const damping = reducedMotion ? 30 : 11;
    yawCurrent.current = THREE.MathUtils.damp(
      yawCurrent.current,
      yawTarget.current,
      damping,
      delta,
    );
    pitchCurrent.current = THREE.MathUtils.damp(
      pitchCurrent.current,
      pitchTarget.current,
      damping,
      delta,
    );

    const targetPosition = focusCard
      ? new THREE.Vector3(0, 1.85, 5.1)
      : new THREE.Vector3(0, 1.68, 4.65);
    camera.position.x = THREE.MathUtils.damp(camera.position.x, targetPosition.x, damping, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, targetPosition.y, damping, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, targetPosition.z, damping, delta);
    camera.rotation.set(pitchCurrent.current, yawCurrent.current, 0);
  });

  return null;
}

function RoomShell() {
  const tables = useMemo(
    () => [
      [-5.8, -0.7],
      [-3.1, -0.8],
      [3.1, -0.8],
      [5.8, -0.7],
      [-5.4, -4.0],
      [-2.7, -4.2],
      [2.7, -4.2],
      [5.4, -4.0],
    ] as const,
    [],
  );

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[22, 28]} />
        <meshStandardMaterial color="#241a26" roughness={0.78} metalness={0.08} />
      </mesh>
      <mesh position={[0, 3, -10.2]} receiveShadow>
        <boxGeometry args={[20, 6, 0.35]} />
        <meshStandardMaterial color="#2e1932" roughness={0.82} />
      </mesh>
      <mesh position={[-9.7, 3, 0]} receiveShadow>
        <boxGeometry args={[0.35, 6, 21]} />
        <meshStandardMaterial color="#20172a" roughness={0.86} />
      </mesh>
      <mesh position={[9.7, 3, 0]} receiveShadow>
        <boxGeometry args={[0.35, 6, 21]} />
        <meshStandardMaterial color="#20172a" roughness={0.86} />
      </mesh>
      <mesh position={[0, 6.05, 0]}>
        <boxGeometry args={[20, 0.2, 21]} />
        <meshStandardMaterial color="#17111f" roughness={0.9} />
      </mesh>

      <group position={[0, 0, -7.9]}>
        <RoundedBox args={[8.4, 0.55, 3.1]} radius={0.16} smoothness={2} position={[0, 0.25, 0]} receiveShadow castShadow>
          <meshStandardMaterial color="#4a2634" roughness={0.65} />
        </RoundedBox>
        <mesh position={[0, 1.32, -1.28]} receiveShadow>
          <boxGeometry args={[8.8, 2.2, 0.22]} />
          <meshStandardMaterial color="#6d1f46" roughness={0.72} />
        </mesh>
        {[-3.3, 3.3].map((x) => (
          <group key={x} position={[x, 2.25, -1.05]}>
            <spotLight
              position={[0, 1.8, 0.6]}
              angle={0.48}
              penumbra={0.75}
              intensity={85}
              color="#ffcc84"
              distance={9}
              castShadow={false}
            />
            <mesh>
              <cylinderGeometry args={[0.16, 0.22, 0.22, 16]} />
              <meshStandardMaterial color="#f2b35f" emissive="#9a4e13" emissiveIntensity={0.6} />
            </mesh>
          </group>
        ))}
      </group>

      {tables.map(([x, z], index) => (
        <BackgroundTable key={`${x}-${z}`} position={[x, z]} phase={index * 0.71} />
      ))}

      {[-6.3, -2.1, 2.1, 6.3].map((x) => (
        <group key={x} position={[x, 5.72, -0.8]}>
          <mesh>
            <cylinderGeometry args={[0.16, 0.22, 0.16, 16]} />
            <meshStandardMaterial color="#a78bfa" emissive="#6d28d9" emissiveIntensity={1.2} />
          </mesh>
          <pointLight color="#8b5cf6" intensity={15} distance={6} decay={2} />
        </group>
      ))}
    </>
  );
}

function BackgroundTable({
  position,
  phase,
}: {
  position: readonly [number, number];
  phase: number;
}) {
  const guest = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!guest.current) return;
    guest.current.rotation.y = Math.sin(clock.elapsedTime * 0.45 + phase) * 0.06;
    guest.current.position.y = Math.sin(clock.elapsedTime * 0.7 + phase) * 0.012;
  });

  return (
    <group position={[position[0], 0, position[1]]}>
      <RoundedBox args={[2.2, 0.14, 1.25]} radius={0.1} smoothness={2} position={[0, 0.72, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#583a31" roughness={0.72} />
      </RoundedBox>
      {[-0.78, 0.78].map((x) => (
        <mesh key={x} position={[x, 0.34, 0]} castShadow>
          <boxGeometry args={[0.13, 0.7, 0.13]} />
          <meshStandardMaterial color="#241a1b" roughness={0.8} />
        </mesh>
      ))}
      <group ref={guest} position={[0, 0.92, -0.36]}>
        <mesh position={[0, 0.38, 0]} castShadow>
          <capsuleGeometry args={[0.2, 0.36, 5, 12]} />
          <meshStandardMaterial color="#374151" roughness={0.78} />
        </mesh>
        <mesh position={[0, 0.86, 0]} castShadow>
          <sphereGeometry args={[0.22, 16, 12]} />
          <meshStandardMaterial color="#b98268" roughness={0.82} />
        </mesh>
        <mesh position={[0, 0.99, -0.04]} castShadow>
          <sphereGeometry args={[0.225, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color="#2a2024" roughness={0.92} />
        </mesh>
      </group>
    </group>
  );
}

function Stage({
  currentNumber,
  drawnCount,
}: {
  currentNumber: number | null;
  drawnCount: number;
}) {
  return (
    <group>
      <group position={[0, 3.6, -9.78]}>
        <RoundedBox args={[5.8, 2.1, 0.18]} radius={0.14} smoothness={3}>
          <meshStandardMaterial color="#100c1b" metalness={0.45} roughness={0.3} emissive="#1d1233" emissiveIntensity={0.45} />
        </RoundedBox>
        <CanvasText text="NUMERO ESTRATTO" position={[0, 0.62, 0.12]} color="#c4b5fd" width={3.2} height={0.34} fontScale={0.42} />
        <CanvasText text={currentNumber?.toString() ?? '—'} position={[0, -0.08, 0.13]} color="#ffd166" width={2.1} height={1.05} fontScale={0.78} />
        <CanvasText text={`${drawnCount} / 90`} position={[0, -0.78, 0.12]} color="#8ee8de" width={2.2} height={0.28} fontScale={0.46} />
      </group>

      <group position={[-2.25, 1.18, -7.82]}>
        <mesh castShadow>
          <sphereGeometry args={[0.74, 24, 18]} />
          <meshPhysicalMaterial color="#c8d8ff" transparent opacity={0.27} transmission={0.75} roughness={0.08} thickness={0.08} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.76, 0.055, 12, 40]} />
          <meshStandardMaterial color="#d6b36a" metalness={0.72} roughness={0.24} />
        </mesh>
        <mesh position={[0, -0.82, 0]} castShadow>
          <cylinderGeometry args={[0.48, 0.68, 0.35, 20]} />
          <meshStandardMaterial color="#462843" metalness={0.35} roughness={0.48} />
        </mesh>
      </group>

      <group position={[1.25, 0.72, -7.8]}>
        <RoundedBox args={[2.3, 0.18, 0.92]} radius={0.08} smoothness={2} position={[0, 0.56, 0]} castShadow>
          <meshStandardMaterial color="#5a332d" roughness={0.62} />
        </RoundedBox>
        <mesh position={[0, 1.15, -0.12]} castShadow>
          <capsuleGeometry args={[0.25, 0.48, 6, 14]} />
          <meshStandardMaterial color="#3b3264" roughness={0.72} />
        </mesh>
        <mesh position={[0, 1.8, -0.12]} castShadow>
          <sphereGeometry args={[0.27, 20, 16]} />
          <meshStandardMaterial color="#b97f64" roughness={0.82} />
        </mesh>
        <mesh position={[0, 1.96, -0.18]}>
          <sphereGeometry args={[0.275, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color="#33252b" roughness={0.9} />
        </mesh>
        <mesh position={[0.25, 1.56, 0.22]} rotation={[0.3, 0, -0.25]}>
          <cylinderGeometry args={[0.035, 0.045, 0.55, 12]} />
          <meshStandardMaterial color="#1a1723" metalness={0.5} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

function PlayerTable() {
  return (
    <group>
      <RoundedBox args={[5.7, 0.17, 2.55]} radius={0.14} smoothness={3} position={[0, 0.75, 3.0]} castShadow receiveShadow>
        <meshStandardMaterial color="#4d302b" roughness={0.58} metalness={0.08} />
      </RoundedBox>
      <RoundedBox args={[5.35, 0.025, 2.2]} radius={0.12} smoothness={2} position={[0, 0.845, 3.0]} receiveShadow>
        <meshStandardMaterial color="#2f1d25" roughness={0.72} />
      </RoundedBox>
      {[-2.35, 2.35].map((x) => (
        <mesh key={x} position={[x, 0.34, 3.0]} castShadow>
          <boxGeometry args={[0.18, 0.7, 0.18]} />
          <meshStandardMaterial color="#21161a" roughness={0.82} />
        </mesh>
      ))}

      <group position={[-2.05, 0.98, 2.42]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.19, 0.16, 0.45, 20]} />
          <meshPhysicalMaterial color="#7dd3fc" transparent opacity={0.42} transmission={0.55} roughness={0.12} />
        </mesh>
        <mesh position={[0, 0.17, 0]}>
          <cylinderGeometry args={[0.13, 0.13, 0.05, 20]} />
          <meshStandardMaterial color="#f7d774" roughness={0.4} />
        </mesh>
      </group>
      <group position={[2.15, 0.94, 2.45]}>
        <RoundedBox args={[0.74, 0.09, 0.48]} radius={0.05} smoothness={2}>
          <meshStandardMaterial color="#d5aa5b" roughness={0.5} />
        </RoundedBox>
        <CanvasText text="PORTAFORTUNA" position={[0, 0.06, 0.06]} rotation={[-Math.PI / 2, 0, 0]} color="#38210f" width={0.62} height={0.12} fontScale={0.42} />
      </group>
    </group>
  );
}

function InteractiveMarker({
  color,
  position,
  selected,
  onSelect,
}: {
  color: string;
  position: [number, number, number];
  selected: boolean;
  onSelect: (color: string) => void;
}) {
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
    <group
      ref={group}
      position={position}
      rotation={[0, 0, Math.PI / 2]}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        gl.domElement.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        gl.domElement.style.cursor = 'grab';
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(color);
      }}
    >
      <mesh castShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.54, 16]} />
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.06, 0.09, 16]} />
        <meshStandardMaterial color="#14121b" roughness={0.7} />
      </mesh>
      {selected && (
        <pointLight position={[0, 0, 0.12]} color={color} intensity={2.5} distance={0.8} />
      )}
    </group>
  );
}

function MarkerTray({
  selectedColor,
  onSelect,
}: {
  selectedColor: string;
  onSelect: (color: string) => void;
}) {
  return (
    <group>
      <RoundedBox args={[2.2, 0.06, 0.52]} radius={0.08} smoothness={2} position={[0, 0.89, 2.0]} receiveShadow>
        <meshStandardMaterial color="#17131e" roughness={0.65} />
      </RoundedBox>
      {MARKER_COLORS.map((color, index) => (
        <InteractiveMarker
          key={color}
          color={color}
          position={[-0.72 + index * 0.48, 0.97, 2.0]}
          selected={selectedColor === color}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

function ItalianCard3D({
  card,
  cardIndex,
  drawn,
  manualMarking,
  markerColor,
  onMarkCell,
}: {
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
    <group position={[0, CARD_Y, CARD_Z]} rotation={[-Math.PI / 2 + 0.22, 0, 0]}>
      <RoundedBox args={[3.35, 1.28, 0.055]} radius={0.06} smoothness={2} position={[0, 0.02, -0.02]} receiveShadow castShadow>
        <meshStandardMaterial color="#efe4c8" roughness={0.72} />
      </RoundedBox>
      <CanvasText text={`CARTELLA ${cardIndex + 1} · BINGO ITALIANO`} position={[0, 0.53, 0.045]} color="#5e4426" width={2.8} height={0.2} fontScale={0.48} />

      {card.cells.map((number, cellIndex) => {
        const row = Math.floor(cellIndex / 9);
        const column = cellIndex % 9;
        const x = (column - 4) * (CELL_WIDTH + 0.015);
        const y = (1 - row) * (CELL_HEIGHT + 0.015) - 0.08;
        const isMarked = marked.has(cellIndex);
        const isDrawn = number !== null && drawn.has(number);
        const wrong = isMarked && !isDrawn;

        return (
          <group key={cellIndex} position={[x, y, 0.03]}>
            <mesh
              castShadow
              receiveShadow
              onPointerOver={(event) => {
                if (number === null || !manualMarking) return;
                event.stopPropagation();
                gl.domElement.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                gl.domElement.style.cursor = 'grab';
              }}
              onPointerDown={(event: ThreeEvent<PointerEvent>) => {
                if (number === null || !manualMarking) return;
                event.stopPropagation();
                onMarkCell(cellIndex, !isMarked);
              }}
            >
              <boxGeometry args={[CELL_WIDTH, CELL_HEIGHT, 0.045]} />
              <meshStandardMaterial
                color={number === null ? '#d5c7a7' : isDrawn ? '#fff1b5' : '#fffaf0'}
                emissive={isDrawn ? '#b46a10' : '#000000'}
                emissiveIntensity={isDrawn ? 0.18 : 0}
                roughness={0.68}
              />
            </mesh>
            {number !== null && (
              <CanvasText
                text={number.toString()}
                position={[0, 0, 0.028]}
                color="#2b2115"
                width={0.25}
                height={0.17}
                fontScale={0.62}
                renderOrder={4}
              />
            )}
            {isMarked && (
              <mesh position={[0, 0, 0.052]} renderOrder={5}>
                <torusGeometry args={[0.092, 0.014, 10, 28]} />
                <meshBasicMaterial color={wrong ? '#ef4444' : markerColor} transparent opacity={0.82} depthTest={false} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function FirstPersonHands({
  markerColor,
  lastMark,
  reducedMotion,
}: {
  markerColor: string;
  lastMark: BingoMarkInteraction | null;
  reducedMotion: boolean;
}) {
  const rightHand = useRef<THREE.Group>(null);
  const animationStart = useRef(0);

  useEffect(() => {
    animationStart.current = performance.now() / 1_000;
  }, [lastMark?.token]);

  useFrame((_state, delta) => {
    if (!rightHand.current) return;
    const elapsed = performance.now() / 1_000 - animationStart.current;
    const active = Boolean(lastMark) && elapsed >= 0 && elapsed < 0.62 && !reducedMotion;
    const row = lastMark ? Math.floor(lastMark.cellIndex / 9) : 1;
    const column = lastMark ? lastMark.cellIndex % 9 : 7;
    const cardX = (column - 4) * (CELL_WIDTH + 0.015);
    const localY = (1 - row) * (CELL_HEIGHT + 0.015) - 0.08;
    const cardWorldZ = CARD_Z - localY;
    const arc = active ? Math.sin((elapsed / 0.62) * Math.PI) : 0;

    const targetX = active ? cardX + 0.12 : 1.72;
    const targetY = active ? CARD_Y + 0.2 + arc * 0.12 : 1.05;
    const targetZ = active ? cardWorldZ + 0.14 : 4.12;
    rightHand.current.position.x = THREE.MathUtils.damp(rightHand.current.position.x, targetX, 18, delta);
    rightHand.current.position.y = THREE.MathUtils.damp(rightHand.current.position.y, targetY, 18, delta);
    rightHand.current.position.z = THREE.MathUtils.damp(rightHand.current.position.z, targetZ, 18, delta);
  });

  return (
    <>
      <group position={[-1.72, 1.02, 4.13]} rotation={[0.16, -0.2, -0.12]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.11, 0.42, 6, 12]} />
          <meshStandardMaterial color="#b98268" roughness={0.84} />
        </mesh>
        <mesh position={[0, -0.29, 0]}>
          <cylinderGeometry args={[0.14, 0.18, 0.32, 16]} />
          <meshStandardMaterial color="#3f3a67" roughness={0.76} />
        </mesh>
      </group>
      <group ref={rightHand} position={[1.72, 1.05, 4.12]} rotation={[0.22, 0.18, 0.12]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.11, 0.42, 6, 12]} />
          <meshStandardMaterial color="#b98268" roughness={0.84} />
        </mesh>
        <mesh position={[0, -0.29, 0]}>
          <cylinderGeometry args={[0.14, 0.18, 0.32, 16]} />
          <meshStandardMaterial color="#3f3a67" roughness={0.76} />
        </mesh>
        <mesh position={[-0.02, 0.23, -0.04]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.027, 0.027, 0.42, 12]} />
          <meshStandardMaterial color={markerColor} roughness={0.45} />
        </mesh>
      </group>
    </>
  );
}

function Scene({
  card,
  cardIndex,
  currentNumber,
  drawnNumbers,
  manualMarking,
  markerColor,
  focusCard,
  reducedMotion,
  lastMark,
  onMarkCell,
  onSelectMarker,
}: Omit<BingoRoomSceneProps, 'players'>) {
  const drawn = useMemo(() => new Set(drawnNumbers), [drawnNumbers]);

  return (
    <>
      <color attach="background" args={['#0f0b18']} />
      <fog attach="fog" args={['#17101f', 12, 26]} />
      <ambientLight intensity={0.75} color="#9c8ad8" />
      <hemisphereLight args={['#f4d9af', '#23152a', 1.25]} />
      <directionalLight
        position={[2.5, 6.8, 4.5]}
        intensity={2.1}
        color="#ffd7a0"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={18}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
      />

      <SeatedCameraController focusCard={focusCard} reducedMotion={reducedMotion} />
      <RoomShell />
      <Stage currentNumber={currentNumber} drawnCount={drawnNumbers.length} />
      <PlayerTable />
      {card && (
        <ItalianCard3D
          card={card}
          cardIndex={cardIndex}
          drawn={drawn}
          manualMarking={manualMarking}
          markerColor={markerColor}
          onMarkCell={onMarkCell}
        />
      )}
      <MarkerTray selectedColor={markerColor} onSelect={onSelectMarker} />
      <FirstPersonHands markerColor={markerColor} lastMark={lastMark} reducedMotion={reducedMotion} />
    </>
  );
}

export default function BingoRoomScene(props: BingoRoomSceneProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [0, 1.68, 4.65], fov: 58, near: 0.08, far: 45 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      performance={{ min: 0.55 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
      }}
    >
      <Scene
        card={props.card}
        cardIndex={props.cardIndex}
        currentNumber={props.currentNumber}
        drawnNumbers={props.drawnNumbers}
        manualMarking={props.manualMarking}
        markerColor={props.markerColor}
        focusCard={props.focusCard}
        reducedMotion={props.reducedMotion}
        lastMark={props.lastMark}
        onMarkCell={props.onMarkCell}
        onSelectMarker={props.onSelectMarker}
      />
    </Canvas>
  );
}
