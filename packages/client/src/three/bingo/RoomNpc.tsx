import { HALL_PALETTE } from '../palette';
import { WAITER_PATH, WAITER_SPEED, waiterPose } from './waiterPath';
import { dampAngle } from './movement';
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import ProceduralCharacter, { type CharacterAnimationState } from '../ProceduralCharacter';
import { labelTexture } from './textures';
import { CARD_DEPTH, CARD_WIDTH, DECK_RADIUS, layoutCards } from './cardLayout';
import { TABLE_TOP_HEIGHT, TABLES, type SeatPlacement } from './hallLayout';
import type { HallOccupant } from './occupants';

/**
 * A guest sitting at a table: body, name tag, ready light and the cards they
 * bought lying in front of them.
 *
 * Other players and the server's NPCs render through the same component — the
 * only difference is the badge — so the hall never shows a visible seam between
 * a real opponent and a bot.
 */

/**
 * Vertical offset for a seated body.
 *
 * The model is authored standing with its hips around 0.72 m; folding the legs
 * into a sitting pose does not lower them, so the whole character has to drop
 * for the hips to land on a 0.49 m chair seat.
 */
const SEATED_BODY_Y = -0.18;

function NameTag({
  text,
  colour,
  y,
  visible,
}: {
  text: string;
  colour: string;
  y: number;
  visible: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const texture = useMemo(
    () => labelTexture(text, { color: colour, fontScale: 0.44, width: 512, height: 128 }),
    [text, colour],
  );

  useFrame(() => {
    const node = group.current;
    if (!node || !visible) return;
    // Billboard towards the camera without inheriting its roll.
    node.quaternion.copy(camera.quaternion);
  });

  if (!texture || !visible) return null;
  return (
    <group ref={group} position={[0, y, 0]}>
      <mesh>
        <planeGeometry args={[0.62, 0.155]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Simplified card props for everyone who is not the local player. */
function GuestCards({ count, seat }: { count: number; seat: SeatPlacement }) {
  const placements = useMemo(() => layoutCards(count), [count]);
  const table = TABLES[seat.tableIndex];
  if (!table || placements.length === 0) return null;
  const x = table.x + Math.cos(seat.angle) * DECK_RADIUS;
  const z = table.z + Math.sin(seat.angle) * DECK_RADIUS;

  return (
    <group position={[x, TABLE_TOP_HEIGHT + 0.016, z]} rotation={[0, seat.facing + Math.PI, 0]}>
      {placements.map((placement) => (
        <mesh
          key={placement.index}
          position={[placement.x, 0, placement.z]}
          rotation={[-Math.PI / 2, 0, placement.rotationY]}
          receiveShadow
        >
          <planeGeometry args={[CARD_WIDTH, CARD_DEPTH]} />
          <meshStandardMaterial color={HALL_PALETTE.paperMuted} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

export function RoomNpc({
  occupant,
  state,
  reducedMotion,
  showName,
  showCards,
  showReadyLight,
}: {
  occupant: HallOccupant;
  state: CharacterAnimationState;
  reducedMotion: boolean;
  showName: boolean;
  showCards: boolean;
  showReadyLight: boolean;
}) {
  const { seat } = occupant;
  const badgeColour =
    occupant.kind === 'PLAYER' ? '#d9ccff' : occupant.kind === 'NPC' ? '#ffd7a0' : '#b9b2cc';
  const heightScale = THREE.MathUtils.clamp(occupant.appearance.heightCm / 175, 0.86, 1.14);

  return (
    <group>
      <group position={[seat.x, SEATED_BODY_Y, seat.z]} rotation={[0, seat.facing, 0]}>
        <ProceduralCharacter
          appearance={occupant.appearance}
          state={state}
          personality={occupant.personality}
          position={[0, 0, 0]}
          rotationY={0}
          scale={0.94}
          phase={occupant.phase * 6.28}
          reducedMotion={reducedMotion}
          seated
        />
        <NameTag
          text={occupant.isHost ? `♛ ${occupant.displayName}` : occupant.displayName}
          colour={badgeColour}
          y={1.72 * heightScale}
          visible={showName}
        />
        {showReadyLight && (
          <mesh position={[0, 1.55 * heightScale, 0]}>
            <sphereGeometry args={[0.045, 8, 6]} />
            <meshBasicMaterial color={occupant.ready ? '#34d399' : '#f59e0b'} toneMapped={false} />
          </mesh>
        )}
      </group>
      {showCards && occupant.cardCount > 0 && <GuestCards count={occupant.cardCount} seat={seat} />}
    </group>
  );
}

const WAITER_APPEARANCE = {
  bodyType: 'slim',
  skinTone: '#b98b62',
  hairStyle: 'buzz',
  hairColor: '#1d1720',
  shirtColor: '#efe9dd',
  pantsColor: '#1b1826',
  heightCm: 176,
} as const;

/**
 * Perimeter aisle only.
 *
 * The loop deliberately hugs the outer walls: a route through the middle of the
 * hall walks the waiter straight through a seated player's camera.
 */
/**
 * Waiter doing laps of the hall with a tray.
 *
 * Purely decorative movement on a fixed loop: it never touches game state and it
 * never blocks the player, which is why it is not in the collider list.
 */
export function WanderingWaiter({ reducedMotion, paused }: { reducedMotion: boolean; paused: boolean }) {
  const group = useRef<THREE.Group>(null);
  const progress = useRef(0);

  useFrame((_state, delta) => {
    const node = group.current;
    if (!node || reducedMotion) return;
    if (!paused) progress.current += Math.min(delta, 0.1) * WAITER_SPEED;
    const pose = waiterPose(progress.current);
    node.position.set(pose.x, 0, pose.z);
    node.rotation.y = dampAngle(node.rotation.y, pose.yaw, 8, delta);  });

  return (
    <group ref={group} position={[WAITER_PATH[0]?.[0] ?? 0, 0, WAITER_PATH[0]?.[1] ?? 0]}>
      <ProceduralCharacter
        appearance={WAITER_APPEARANCE}
        state={paused || reducedMotion ? 'IDLE' : 'WALK'}
        personality="DISTRACTED"
        position={[0, 0, 0]}
        rotationY={0}
        scale={0.96}
        phase={0.9}
        carryingTray
        reducedMotion={reducedMotion}
      />
      <group position={[0.3, 1.04, 0.58]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.17, 0.17, 0.018, 14]} />
          <meshStandardMaterial color="#c9b48a" roughness={0.42} metalness={0.28} />
        </mesh>
        {[
          [-0.06, 0],
          [0.06, 0.04],
          [0.01, -0.07],
        ].map(([x, z], index) => (
          <mesh key={index} position={[x ?? 0, 0.05, z ?? 0]}>
            <cylinderGeometry args={[0.026, 0.021, 0.08, 8]} />
            <meshStandardMaterial color="#d8ecf5" roughness={0.14} transparent opacity={0.55} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export default RoomNpc;
