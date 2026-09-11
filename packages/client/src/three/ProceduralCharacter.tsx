import { useEffect, useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createHeadGeometry, createSmileGeometry, createTorsoGeometry } from './characterGeometry';
import { AVATAR_PALETTE } from './palette';
import { motionForState, PERSONALITY_SPEED } from './characterMotion';
import { bodyProportions, headGroupY, neckScale } from './bodyProportions';
import {
  resolveAvatarAppearance,
  type AvatarAppearance,
  type ResolvedAvatarAppearance,
} from '@bingo/shared';

/**
 * Procedural social-game character.
 *
 * The target is a friendly casual-game avatar — readable face, soft joints,
 * rounded silhouette — not a photoreal human. Everything is built from
 * primitives so any appearance can be rendered without downloading a model, and
 * the whole body is one shallow hierarchy of groups that the animation loop
 * drives directly.
 */

export const CHARACTER_ANIMATION_STATES = [
  'IDLE',
  'SEATED_IDLE',
  'LOOK_AROUND',
  'LOOK_AT_STAGE',
  'LOOK_AT_CARD',
  'MARK_NUMBER',
  'PICK_MARKER',
  'TALK',
  'LISTEN',
  'LAUGH',
  'WAVE',
  'APPLAUD',
  'DANCE',
  'CELEBRATE',
  'DISAPPOINTED',
  'SCARED',
  'ARGUE',
  'STAND_UP',
  'WALK',
  'RUN',
  'ZOMBIE_IDLE',
  'ZOMBIE_MOVE',
  'ZOMBIE_FEED',
  'RETURN_TO_SEAT',
] as const;

export type CharacterAnimationState = (typeof CHARACTER_ANIMATION_STATES)[number];
export type CharacterPersonality =
  | 'CALM'
  | 'NERVOUS'
  | 'LOUD'
  | 'LUCKY'
  | 'GRUMPY'
  | 'DISTRACTED'
  | 'PRANKSTER';

type Vector3Tuple = [number, number, number];

interface ProceduralCharacterProps {
  appearance: AvatarAppearance;
  state: CharacterAnimationState;
  personality?: CharacterPersonality;
  position?: Vector3Tuple;
  rotationY?: number;
  scale?: number;
  phase?: number;
  reducedMotion?: boolean;
  seated?: boolean;
  carryingTray?: boolean;
}

function Hair({ appearance }: { appearance: ResolvedAvatarAppearance }) {
  const colour = appearance.hairColor;

  if (appearance.hairStyle === 'buzz') {
    return (
      <mesh position={[0, 0.15, -0.012]} scale={[1.03, 0.52, 1.03]} castShadow>
        <sphereGeometry args={[0.203, 18, 12]} />
        <meshStandardMaterial color={colour} roughness={0.95} />
      </mesh>
    );
  }

  if (appearance.hairStyle === 'curly') {
    return (
      <group position={[0, 0.14, -0.015]}>
        {[
          [-0.135, 0, 0.01],
          [0, 0.06, -0.02],
          [0.135, 0, 0.01],
          [-0.07, 0.085, -0.015],
          [0.07, 0.085, -0.015],
          [-0.115, -0.045, -0.075],
          [0.115, -0.045, -0.075],
        ].map((offset, index) => (
          <mesh key={index} position={offset as Vector3Tuple} castShadow>
            <sphereGeometry args={[0.098, 12, 9]} />
            <meshStandardMaterial color={colour} roughness={0.96} />
          </mesh>
        ))}
      </group>
    );
  }

  if (appearance.hairStyle === 'bob' || appearance.hairStyle === 'long') {
    const long = appearance.hairStyle === 'long';
    return (
      <group>
        <mesh position={[0, long ? -0.09 : 0.0, -0.105]} scale={[1.14, long ? 1.8 : 1.22, 0.8]} castShadow>
          <sphereGeometry args={[0.217, 18, 12]} />
          <meshStandardMaterial color={colour} roughness={0.93} />
        </mesh>
        <mesh position={[0, 0.155, -0.004]} scale={[1.08, 0.54, 1.06]} castShadow>
          <sphereGeometry args={[0.208, 18, 12]} />
          <meshStandardMaterial color={colour} roughness={0.92} />
        </mesh>
        <mesh position={[0, 0.13, 0.13]} rotation={[0.5, 0, 0]} scale={[1, 0.5, 1]}>
          <sphereGeometry args={[0.15, 14, 10]} />
          <meshStandardMaterial color={colour} roughness={0.92} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh position={[0, 0.155, -0.012]} scale={[1.09, 0.58, 1.05]} castShadow>
        <sphereGeometry args={[0.204, 18, 12]} />
        <meshStandardMaterial color={colour} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.12, 0.135]} rotation={[0.45, 0, 0]} scale={[1, 0.42, 0.9]}>
        <sphereGeometry args={[0.145, 14, 10]} />
        <meshStandardMaterial color={colour} roughness={0.92} />
      </mesh>
      <mesh position={[-0.105, 0.185, 0.055]} rotation={[0.18, 0, -0.42]} castShadow>
        <coneGeometry args={[0.062, 0.16, 8]} />
        <meshStandardMaterial color={colour} roughness={0.93} />
      </mesh>
    </group>
  );
}

const EYE_SHAPE: Record<ResolvedAvatarAppearance['eyeStyle'], { scaleY: number; tilt: number }> = {
  round: { scaleY: 1, tilt: 0 },
  soft: { scaleY: 0.82, tilt: 0.08 },
  sharp: { scaleY: 0.7, tilt: 0.22 },
  sleepy: { scaleY: 0.52, tilt: -0.12 },
};

const BROW_SHAPE: Record<ResolvedAvatarAppearance['browStyle'], { y: number; tilt: number; thickness: number }> = {
  neutral: { y: 0.083, tilt: 0, thickness: 0.014 },
  arched: { y: 0.094, tilt: 0.2, thickness: 0.013 },
  thick: { y: 0.08, tilt: 0.04, thickness: 0.021 },
  worried: { y: 0.086, tilt: -0.26, thickness: 0.013 },
};

const MOUTH_SHAPE: Record<ResolvedAvatarAppearance['mouthStyle'], { width: number; curve: number }> = {
  smile: { width: 1, curve: 0.24 },
  neutral: { width: 0.86, curve: 0 },
  grin: { width: 1.18, curve: 0.38 },
  smirk: { width: 0.95, curve: 0.18 },
};

function Face({
  appearance,
  mouthRef,
  browRef,
  eyelidRefs,
}: {
  appearance: ResolvedAvatarAppearance;
  mouthRef: React.RefObject<THREE.Group | null>;
  browRef: React.RefObject<THREE.Group | null>;
  eyelidRefs: readonly [React.RefObject<THREE.Mesh | null>, React.RefObject<THREE.Mesh | null>];
}) {
  const eye = EYE_SHAPE[appearance.eyeStyle];
  const brow = BROW_SHAPE[appearance.browStyle];
  const mouth = MOUTH_SHAPE[appearance.mouthStyle];
  const smile = useMemo(() => createSmileGeometry(mouth.width, mouth.curve, appearance.mouthStyle === 'smirk'), [mouth.width, mouth.curve, appearance.mouthStyle]);
  useEffect(() => () => smile.dispose(), [smile]);

  return (
    <group>
      {([-1, 1] as const).map((side, index) => (
        <group key={side} position={[side * 0.079, 0.028, 0.198]} rotation={[0, side * 0.16, side * eye.tilt]}>
          {/* Sclera, iris and a specular dot: the highlight is what stops the
              eyes reading as dead sockets. */}
          <mesh scale={[1, eye.scaleY, 0.5]}>
            <sphereGeometry args={[0.031, 12, 10]} />
            <meshStandardMaterial color={AVATAR_PALETTE.eyeWhite} roughness={0.32} />
          </mesh>
          <mesh position={[0, 0, 0.014]} scale={[1, eye.scaleY, 0.4]}>
            <sphereGeometry args={[0.017, 10, 8]} />
            <meshStandardMaterial color={appearance.eyeColor} roughness={0.28} />
          </mesh>
          <mesh position={[0, 0, 0.02]} scale={[1, eye.scaleY, 0.4]}>
            <sphereGeometry args={[0.0075, 8, 6]} />
            <meshBasicMaterial color={AVATAR_PALETTE.pupil} />
          </mesh>
          <mesh position={[-side * 0.008, 0.008, 0.024]}>
            <sphereGeometry args={[0.004, 6, 5]} />
            <meshBasicMaterial color={AVATAR_PALETTE.highlight} />
          </mesh>
          <mesh
            ref={eyelidRefs[index === 0 ? 0 : 1]}
            position={[0, 0.018, 0.016]}
            scale={[1.06, 0.02, 0.6]}
          >
            <sphereGeometry args={[0.032, 10, 8]} />
            <meshStandardMaterial color={appearance.skinTone} roughness={0.9} />
          </mesh>
        </group>
      ))}

      <group ref={browRef}>
        {([-1, 1] as const).map((side) => (
          <mesh
            key={side}
            position={[side * 0.079, brow.y, 0.196]}
            rotation={[0, 0, Math.PI / 2 + side * brow.tilt]}
            scale={[1, 1, 0.6]}
          >
            <capsuleGeometry args={[brow.thickness, 0.05, 3, 6]} />
            <meshStandardMaterial color={appearance.hairColor} roughness={0.9} />
          </mesh>
        ))}
      </group>

      {/* Nose: a soft wedge rather than a sphere stuck on the face. */}
      <mesh position={[0, -0.018, 0.213]} rotation={[0.35, 0, 0]} scale={[0.62, 1, 0.7]}>
        <capsuleGeometry args={[0.021, 0.028, 3, 8]} />
        <meshStandardMaterial color={appearance.skinTone} roughness={0.9} />
      </mesh>

      {/* The baseline expression is a readable curve, while opening the mouth
          adds a separate oval. Scaling the whole smile made idle lips vanish. */}
      <group position={[0, -0.084, 0.205]}>
        <mesh geometry={smile}>
          <meshBasicMaterial color={AVATAR_PALETTE.mouth} />
        </mesh>
        <group ref={mouthRef} position={[0, -0.015, 0.006]}>
          <mesh scale={[mouth.width * 1.45, 0.78, 0.28]}>
            <sphereGeometry args={[0.032, 14, 10]} />
            <meshBasicMaterial color={AVATAR_PALETTE.mouth} />
          </mesh>
          {appearance.mouthStyle === 'grin' && (
            <mesh position={[0, 0.012, 0.01]} scale={[1.25, 0.22, 0.15]}>
              <sphereGeometry args={[0.032, 10, 6]} />
              <meshBasicMaterial color={AVATAR_PALETTE.eyeWhite} />
            </mesh>
          )}
        </group>
      </group>
      {/* Ears */}
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * 0.196, 0.005, 0.005]} rotation={[0, 0, side * 0.2]} scale={[0.42, 1, 0.75]}>
          <sphereGeometry args={[0.048, 10, 8]} />
          <meshStandardMaterial color={appearance.skinTone} roughness={0.9} />
        </mesh>
      ))}

      {/* Cheeks give the face a bit of colour without a texture. */}
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * 0.125, -0.038, 0.168]} scale={[1, 0.7, 0.25]}>
          <sphereGeometry args={[0.042, 10, 8]} />
          <meshStandardMaterial color={AVATAR_PALETTE.blush} roughness={0.95} transparent opacity={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Accessory({ appearance }: { appearance: ResolvedAvatarAppearance }) {
  switch (appearance.accessory) {
    case 'glasses':
      return (
        <group position={[0, 0.028, 0.234]}>
          {([-1, 1] as const).map((side) => (
            <mesh key={side} position={[side * 0.079, 0, 0]}>
              <torusGeometry args={[0.042, 0.0055, 6, 16]} />
              <meshStandardMaterial color={appearance.accessoryColor} roughness={0.3} metalness={0.6} />
            </mesh>
          ))}
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.0045, 0.0045, 0.078, 6]} />
            <meshStandardMaterial color={appearance.accessoryColor} roughness={0.3} metalness={0.6} />
          </mesh>
        </group>
      );
    case 'earrings':
      return (
        <group>
          {([-1, 1] as const).map((side) => (
            <mesh key={side} position={[side * 0.2, -0.038, 0.006]}>
              <sphereGeometry args={[0.018, 8, 6]} />
              <meshStandardMaterial color={appearance.accessoryColor} roughness={0.2} metalness={0.85} />
            </mesh>
          ))}
        </group>
      );
    case 'cap':
      return (
        <group position={[0, 0.155, 0]}>
          <mesh scale={[1.06, 0.62, 1.04]} castShadow>
            <sphereGeometry args={[0.212, 16, 12]} />
            <meshStandardMaterial color={appearance.accessoryColor} roughness={0.75} />
          </mesh>
          <mesh position={[0, -0.045, 0.19]} rotation={[-0.18, 0, 0]} scale={[1, 0.14, 1]}>
            <cylinderGeometry args={[0.15, 0.15, 0.09, 14, 1, false, -Math.PI / 2, Math.PI]} />
            <meshStandardMaterial color={appearance.accessoryColor} roughness={0.75} />
          </mesh>
        </group>
      );
    case 'scarf':
      return (
        <group position={[0, -0.29, 0.01]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.115, 0.042, 8, 18]} />
            <meshStandardMaterial color={appearance.accessoryColor} roughness={0.92} />
          </mesh>
          <mesh position={[0.055, -0.14, 0.1]} rotation={[0.2, 0, 0.14]}>
            <boxGeometry args={[0.08, 0.24, 0.03]} />
            <meshStandardMaterial color={appearance.accessoryColor} roughness={0.92} />
          </mesh>
        </group>
      );
    case 'none':
    default:
      return null;
  }
}

function Arm({
  side,
  appearance,
  armRef,
  elbowRef,
  shoulderWidth,
}: {
  side: -1 | 1;
  appearance: ResolvedAvatarAppearance;
  armRef: React.RefObject<THREE.Group | null>;
  elbowRef: React.RefObject<THREE.Group | null>;
  shoulderWidth: number;
}) {
  return (
    <group ref={armRef} position={[side * 0.255 * shoulderWidth, 1.4, 0]} rotation-order="YXZ">
      {/* The sleeve overlaps the tailored shoulder. A separate deltoid ball
          looked like an exposed mannequin joint even when its gap was closed. */}
      <mesh position={[0, -0.17, 0]} castShadow>
        <capsuleGeometry args={[0.082, 0.26, 5, 10]} />
        <meshStandardMaterial color={appearance.shirtColor} roughness={0.78} />
      </mesh>
      <group ref={elbowRef} position={[0, -0.4, 0]}>
        <mesh scale={[1, 0.9, 1]}>
          <sphereGeometry args={[0.062, 10, 8]} />
          <meshStandardMaterial color={appearance.skinTone} roughness={0.88} />
        </mesh>
        <mesh position={[0, -0.16, 0]} castShadow>
          <capsuleGeometry args={[0.057, 0.22, 5, 10]} />
          <meshStandardMaterial color={appearance.skinTone} roughness={0.88} />
        </mesh>
        {/* Hand: palm plus a thumb, enough shape to read at hall distance. */}
        <group position={[0, -0.33, 0.012]}>
          <mesh scale={[0.78, 1.08, 0.52]} castShadow>
            <sphereGeometry args={[0.082, 12, 9]} />
            <meshStandardMaterial color={appearance.skinTone} roughness={0.9} />
          </mesh>
          <mesh position={[side * 0.052, 0.018, 0.014]} rotation={[0, 0, side * 0.7]} scale={[0.7, 1, 0.7]}>
            <capsuleGeometry args={[0.019, 0.032, 3, 6]} />
            <meshStandardMaterial color={appearance.skinTone} roughness={0.9} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export default function ProceduralCharacter({
  appearance,
  state,
  personality = 'CALM',
  position = [0, 0, 0],
  rotationY = 0,
  scale = 1,
  phase = 0,
  reducedMotion = false,
  seated = false,
  carryingTray = false,
}: ProceduralCharacterProps) {
  const resolved = useMemo(() => resolveAvatarAppearance(appearance), [appearance]);
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Group>(null);
  const brows = useRef<THREE.Group>(null);
  const leftEyelid = useRef<THREE.Mesh>(null);
  const rightEyelid = useRef<THREE.Mesh>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftElbow = useRef<THREE.Group>(null);
  const rightElbow = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftKnee = useRef<THREE.Group>(null);
  const rightKnee = useRef<THREE.Group>(null);
  const nextBlink = useRef(1.5 + Math.random() * 3);
  const blinkTimer = useRef(0);

  const baseY = position[1];
  // Height is not a uniform scale: breadth lags behind it and the head lags
  // further still, which is what separates a short person from a shrunk one.
  const proportions = bodyProportions(resolved.heightCm, resolved.bodyType);
  const bodyWidth = proportions.widths.chest;
  const shoulderWidth = proportions.widths.shoulders;
  const hipWidth = proportions.widths.hips;
  const rootScale: Vector3Tuple = [
    scale * proportions.horizontal,
    scale * proportions.vertical,
    scale * proportions.horizontal,
  ];
  const motionSpeed = PERSONALITY_SPEED[personality];
  const skullGeometry = useMemo(() => createHeadGeometry(), []);
  const torsoGeometry = useMemo(() => createTorsoGeometry(), []);
  useEffect(() => () => { skullGeometry.dispose(); torsoGeometry.dispose(); }, [skullGeometry, torsoGeometry]);

  const skinMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: resolved.skinTone, roughness: 0.9, metalness: 0 }),
    [resolved.skinTone],
  );
  useEffect(() => () => skinMaterial.dispose(), [skinMaterial]);

  const eyelidRefs = useMemo(
    () => [leftEyelid, rightEyelid] as const,
    [],
  );

  useFrame(({ clock }, delta) => {
    if (
      !root.current ||
      !torso.current ||
      !head.current ||
      !leftArm.current ||
      !rightArm.current ||
      !leftElbow.current ||
      !rightElbow.current ||
      !leftLeg.current ||
      !rightLeg.current ||
      !leftKnee.current ||
      !rightKnee.current
    ) {
      return;
    }

    const locomotion = state === 'WALK' || state === 'RUN' || state === 'ZOMBIE_MOVE';
    const time = clock.elapsedTime * motionSpeed * (locomotion ? 6 : 1) + phase;
    const wave = reducedMotion ? 0 : Math.sin(time);
    const beat = reducedMotion ? 0 : Math.sin(time * 2.1);
    const targets = motionForState(state, wave, beat, seated);
    if (state === 'APPLAUD') {
      targets.leftArmY *= shoulderWidth;
      targets.rightArmY *= shoulderWidth;
    }
    if (carryingTray) {
      targets.rightArmX = -0.8;
      targets.rightArmZ = 0;
      targets.rightElbowX = -0.5;
    }
    const damping = reducedMotion ? 26 : 8.5;
    const breathing = reducedMotion ? 0 : Math.sin(time * 1.1) * 0.009;

    const set = (current: number, target: number) =>
      THREE.MathUtils.damp(current, target, damping, delta);

    root.current.position.y = set(root.current.position.y, baseY + targets.rootY + breathing);
    torso.current.rotation.x = set(torso.current.rotation.x, targets.torsoX);
    torso.current.rotation.z = set(torso.current.rotation.z, targets.torsoZ);
    head.current.rotation.x = set(head.current.rotation.x, targets.headX);
    head.current.rotation.y = set(head.current.rotation.y, targets.headY);
    head.current.rotation.z = set(head.current.rotation.z, targets.headZ);
    leftArm.current.rotation.x = set(leftArm.current.rotation.x, targets.leftArmX);
    leftArm.current.rotation.y = set(leftArm.current.rotation.y, targets.leftArmY);
    leftArm.current.rotation.z = set(leftArm.current.rotation.z, targets.leftArmZ);
    rightArm.current.rotation.x = set(rightArm.current.rotation.x, targets.rightArmX);
    rightArm.current.rotation.y = set(rightArm.current.rotation.y, targets.rightArmY);
    rightArm.current.rotation.z = set(rightArm.current.rotation.z, targets.rightArmZ);
    leftElbow.current.rotation.x = set(leftElbow.current.rotation.x, targets.leftElbowX);
    rightElbow.current.rotation.x = set(rightElbow.current.rotation.x, targets.rightElbowX);
    leftLeg.current.rotation.x = set(leftLeg.current.rotation.x, targets.leftLegX);
    rightLeg.current.rotation.x = set(rightLeg.current.rotation.x, targets.rightLegX);
    leftKnee.current.rotation.x = set(leftKnee.current.rotation.x, targets.leftKneeX);
    rightKnee.current.rotation.x = set(rightKnee.current.rotation.x, targets.rightKneeX);

    if (mouth.current) {
      mouth.current.scale.y = THREE.MathUtils.damp(mouth.current.scale.y, targets.mouth, 15, delta);
    }
    if (brows.current) {
      brows.current.position.y = THREE.MathUtils.damp(
        brows.current.position.y,
        targets.browLift * 0.016,
        12,
        delta,
      );
    }

    // Blinking on an irregular timer is a cheap trick that does more for
    // "alive" than any amount of extra geometry.
    if (!reducedMotion) {
      blinkTimer.current += delta;
      const blinking = blinkTimer.current > nextBlink.current;
      if (blinking && blinkTimer.current > nextBlink.current + 0.12) {
        blinkTimer.current = 0;
        nextBlink.current = 1.8 + Math.random() * 4;
      }
      const openness = blinking ? 0.02 : targets.blink;
      for (const lid of eyelidRefs) {
        if (!lid.current) continue;
        lid.current.scale.y = THREE.MathUtils.damp(
          lid.current.scale.y,
          blinking ? 1.05 : 0.02 + (1 - openness) * 0.8,
          26,
          delta,
        );
      }
    }
  });

  return (
    <group ref={root} position={position} rotation={[0, rotationY, 0]} scale={rootScale}>
      {/* Bending starts at the waist; the feet remain in their own rig. */}
      <group ref={torso} position={[0, 0.7, 0]}>
        <group position={[0, -0.7, 0]}>
        {/* Hips. Their width is what makes a curvy build read as one. */}
        <RoundedBox args={[0.44 * hipWidth, 0.24, 0.3]} radius={0.07} smoothness={3} position={[0, 0.84, 0]} castShadow>
          <meshStandardMaterial color={resolved.pantsColor} roughness={0.84} />
        </RoundedBox>
        {/* A continuous, tapered shirt silhouette. */}
        <mesh geometry={torsoGeometry} scale={[bodyWidth * shoulderWidth, 1, 0.62]} castShadow>
          <meshStandardMaterial color={resolved.shirtColor} roughness={0.82} />
        </mesh>
        <mesh position={[0, 1.49, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.098, 0.018, 6, 18]} />
          <meshStandardMaterial color={resolved.shirtColor} roughness={0.95} />
        </mesh>
        <mesh position={[0, 1.505, 0]} scale={[1, neckScale(proportions.headRelative), 1]} castShadow>
          <cylinderGeometry args={[0.082, 0.1, 0.14, 14]} />
          <primitive object={skinMaterial} attach="material" />
        </mesh>

        <Arm side={-1} appearance={resolved} armRef={leftArm} elbowRef={leftElbow} shoulderWidth={shoulderWidth} />
        <Arm side={1} appearance={resolved} armRef={rightArm} elbowRef={rightElbow} shoulderWidth={shoulderWidth} />

        <group
          ref={head}
          position={[0, headGroupY(proportions.headRelative) - 0.04, 0]}
          scale={proportions.headRelative}
        >
          <mesh geometry={skullGeometry} castShadow>
            <primitive object={skinMaterial} attach="material" />
          </mesh>
          <Hair appearance={resolved} />
          <Face appearance={resolved} mouthRef={mouth} browRef={brows} eyelidRefs={eyelidRefs} />
          <Accessory appearance={resolved} />
        </group>
      </group>
      </group>
        {([-1, 1] as const).map((side) => (
          <group key={side} ref={side === -1 ? leftLeg : rightLeg} position={[side * 0.15 * hipWidth, 0.7, 0]}>
            <mesh position={[0, -0.17, 0]} castShadow>
              <capsuleGeometry args={[0.093, 0.22, 6, 12]} />
              <meshStandardMaterial color={resolved.pantsColor} roughness={0.84} />
            </mesh>
            <group ref={side === -1 ? leftKnee : rightKnee} position={[0, -0.36, 0]}>
              <mesh scale={[1, 0.9, 1]}>
                <sphereGeometry args={[0.081, 10, 8]} />
                <meshStandardMaterial color={resolved.pantsColor} roughness={0.85} />
              </mesh>
              <mesh position={[0, -0.13, 0]} castShadow>
                <capsuleGeometry args={[0.076, 0.19, 6, 12]} />
                <meshStandardMaterial color={resolved.pantsColor} roughness={0.86} />
              </mesh>
              {/* Shoe with a rounded toe rather than a flat brick */}
              <group position={[0, -0.29, 0.045]}>
                <RoundedBox args={[0.175, 0.095, 0.28]} radius={0.045} smoothness={2} castShadow>
                  <meshStandardMaterial color={AVATAR_PALETTE.shoe} roughness={0.66} />
                </RoundedBox>
                <mesh position={[0, -0.038, 0.01]}>
                  <boxGeometry args={[0.18, 0.026, 0.29]} />
                  <meshStandardMaterial color={AVATAR_PALETTE.sole} roughness={0.85} />
                </mesh>
              </group>
            </group>
          </group>
        ))}

    </group>
  );
}
