import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  AVATAR_EYE_HEIGHT,
  isSightBlocked,
  type AvatarAppearance,
  type AvatarBodyType,
  type AvatarHairStyle,
} from '@bingo/shared';
import { getRoom, type RemotePlayer } from '../net/hubConnection';
import { useHubStore } from '../store/hub';
import { damp, dampAngle } from './damping';
import { localPlayer } from './localPlayer';
import { labelAnchors, writeLabelAnchor, type LabelAnchor } from './labels';
import ProceduralCharacter, {
  type CharacterAnimationState,
  type CharacterPersonality,
} from './ProceduralCharacter';

const CULL_DISTANCE = 46;
const SMOOTHING_RATE = 14;
/** Line-of-sight refresh period, roughly 8 Hz. */
const SIGHT_CHECK_SECONDS = 0.125;

interface SmoothedPose {
  x: number;
  z: number;
  rotY: number;
}

const DEFAULT_APPEARANCE: AvatarAppearance = {
  bodyType: 'neutral',
  skinTone: '#d8a17c',
  hairStyle: 'short',
  hairColor: '#2b2118',
  shirtColor: '#7c5cff',
  pantsColor: '#34306f',
  heightCm: 175,
};

const PERSONALITIES: CharacterPersonality[] = [
  'CALM',
  'NERVOUS',
  'LOUD',
  'LUCKY',
  'GRUMPY',
  'DISTRACTED',
  'PRANKSTER',
];

function hashFor(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function phaseFor(value: string): number {
  return (hashFor(value) % 628) / 100;
}

function personalityFor(value: string): CharacterPersonality {
  return PERSONALITIES[hashFor(value) % PERSONALITIES.length] ?? 'CALM';
}

function bodyTypeFor(value: string | undefined): AvatarBodyType {
  if (value === 'slim' || value === 'athletic' || value === 'curvy') return value;
  return 'neutral';
}

function hairStyleFor(value: string | undefined): AvatarHairStyle {
  if (value === 'buzz' || value === 'bob' || value === 'curly' || value === 'long') {
    return value;
  }
  return 'short';
}

function appearanceFor(remote: RemotePlayer | undefined): AvatarAppearance {
  if (!remote) return DEFAULT_APPEARANCE;
  return {
    bodyType: bodyTypeFor(remote.bodyType),
    skinTone: remote.skinTone || DEFAULT_APPEARANCE.skinTone,
    hairStyle: hairStyleFor(remote.hairStyle),
    hairColor: remote.hairColor || DEFAULT_APPEARANCE.hairColor,
    shirtColor: remote.shirtColor || DEFAULT_APPEARANCE.shirtColor,
    pantsColor: remote.pantsColor || DEFAULT_APPEARANCE.pantsColor,
    heightCm: THREE.MathUtils.clamp(Math.round(remote.heightCm || 175), 140, 210),
  };
}

function animationFor(remote: RemotePlayer, isSelf: boolean): CharacterAnimationState {
  switch (remote.emote) {
    case 'dance':
    case 'cheer':
    case 'clap':
      return 'CELEBRATE';
    case 'wave':
      return 'TALK';
    case 'laugh':
      return 'LAUGH';
    case 'sit':
      return 'SEATED_IDLE';
    default:
      break;
  }

  const moving = isSelf ? localPlayer.moving : remote.moving;
  const running = isSelf ? localPlayer.running : remote.running;
  if (running && moving) return 'RUN';
  if (moving) return 'WALK';
  return 'IDLE';
}

function HubCharacter({
  sessionId,
  isSelf,
  appearance,
}: {
  sessionId: string;
  isSelf: boolean;
  appearance: AvatarAppearance;
}) {
  const root = useRef<THREE.Group>(null);
  const pose = useRef<SmoothedPose | null>(null);
  const animationRef = useRef<CharacterAnimationState>('IDLE');
  const [animation, setAnimation] = useState<CharacterAnimationState>('IDLE');
  const { camera } = useThree();
  const projected = useMemo(() => new THREE.Vector3(), []);
  const anchorPoint = useMemo(() => new THREE.Vector3(), []);
  // The anchor object is created once and mutated in place; PlayerLabels reads
  // it from the shared map on its own animation frame.
  const anchor = useMemo<LabelAnchor>(
    () => ({ x: 0, y: 0, visible: false, distance: Number.POSITIVE_INFINITY }),
    [],
  );
  const occluded = useRef(false);
  const nextSightCheck = useRef(0);
  const phase = useMemo(() => phaseFor(sessionId), [sessionId]);
  const personality = useMemo(() => personalityFor(sessionId), [sessionId]);

  useEffect(() => {
    labelAnchors.set(sessionId, anchor);
    return () => {
      labelAnchors.delete(sessionId);
    };
  }, [anchor, sessionId]);

  useFrame((state, rawDelta) => {
    const node = root.current;
    const remote = getRoom()?.state.players.get(sessionId);
    if (!node || !remote) {
      if (node) node.visible = false;
      return;
    }

    const dt = Math.min(rawDelta, 0.1);
    let current = pose.current;
    if (!current) {
      current = { x: remote.x, z: remote.z, rotY: remote.rotY };
      pose.current = current;
    }

    if (isSelf) {
      current.x = localPlayer.x;
      current.z = localPlayer.z;
      current.rotY = localPlayer.rotY;
    } else {
      current.x = damp(current.x, remote.x, SMOOTHING_RATE, dt);
      current.z = damp(current.z, remote.z, SMOOTHING_RATE, dt);
      current.rotY = dampAngle(current.rotY, remote.rotY, SMOOTHING_RATE, dt);
    }

    const distance = Math.hypot(camera.position.x - current.x, camera.position.z - current.z);
    node.visible = distance < CULL_DISTANCE;
    if (!node.visible) {
      anchor.visible = false;
      anchor.distance = distance;
      return;
    }

    node.position.set(current.x, 0, current.z);
    node.rotation.set(0, current.rotY, 0);

    const nextAnimation = animationFor(remote, isSelf);
    if (animationRef.current !== nextAnimation) {
      animationRef.current = nextAnimation;
      setAnimation(nextAnimation);
    }

    // Line of sight is re-tested a few times a second, not every frame, and the
    // schedule is staggered per player so twenty avatars never all test on the
    // same frame. The staleness that buys is invisible at walking speed.
    if (state.clock.elapsedTime >= nextSightCheck.current) {
      nextSightCheck.current = state.clock.elapsedTime + SIGHT_CHECK_SECONDS + phase * 0.01;
      occluded.current = isSightBlocked(
        camera.position.x,
        camera.position.z,
        current.x,
        current.z,
      );
    }

    const scale = appearance.heightCm / 175;
    anchorPoint.set(current.x, (AVATAR_EYE_HEIGHT + 0.48) * scale, current.z);
    writeLabelAnchor(
      anchor,
      camera,
      anchorPoint,
      state.size.width,
      state.size.height,
      distance,
      occluded.current,
      projected,
    );
  });

  return (
    <group ref={root}>
      {isSelf && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
          <ringGeometry args={[0.48, 0.56, 40]} />
          <meshBasicMaterial color="#ffe15a" transparent opacity={0.88} />
        </mesh>
      )}
      <ProceduralCharacter
        appearance={appearance}
        state={animation}
        personality={personality}
        position={[0, 0.28, 0]}
        phase={phase}
      />
    </group>
  );
}

/**
 * Full articulated characters for the shared hub. Movement remains predicted
 * locally for the current player and smoothed for remote players; only the
 * visual representation changes from the legacy instanced mannequin.
 */
export default function Crowd() {
  const players = useHubStore((state) => state.players);
  const mySessionId = useHubStore((state) => state.mySessionId);
  const room = getRoom();

  return (
    <group>
      {players.map((player) => (
        <HubCharacter
          key={player.sessionId}
          sessionId={player.sessionId}
          isSelf={player.sessionId === mySessionId}
          appearance={appearanceFor(room?.state.players.get(player.sessionId))}
        />
      ))}
    </group>
  );
}
