import { useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AvatarAppearance } from '@bingo/shared';

export const CHARACTER_ANIMATION_STATES = [
  'IDLE',
  'SEATED_IDLE',
  'LOOK_AT_STAGE',
  'LOOK_AT_CARD',
  'MARK_NUMBER',
  'TALK',
  'LAUGH',
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
}

interface MotionTargets {
  rootY: number;
  torsoX: number;
  torsoZ: number;
  headX: number;
  headY: number;
  leftArmX: number;
  leftArmZ: number;
  rightArmX: number;
  rightArmZ: number;
  leftLegX: number;
  rightLegX: number;
  leftKneeX: number;
  rightKneeX: number;
  mouth: number;
}

const BODY_WIDTH: Record<AvatarAppearance['bodyType'], number> = {
  neutral: 1,
  slim: 0.84,
  athletic: 1.14,
  curvy: 1.1,
};

const PERSONALITY_SPEED: Record<CharacterPersonality, number> = {
  CALM: 0.72,
  NERVOUS: 1.55,
  LOUD: 1.2,
  LUCKY: 0.94,
  GRUMPY: 0.68,
  DISTRACTED: 0.82,
  PRANKSTER: 1.32,
};

const BASE_TARGETS: MotionTargets = {
  rootY: 0,
  torsoX: 0,
  torsoZ: 0,
  headX: 0,
  headY: 0,
  leftArmX: -0.18,
  leftArmZ: 0.12,
  rightArmX: -0.18,
  rightArmZ: -0.12,
  leftLegX: 0,
  rightLegX: 0,
  leftKneeX: 0,
  rightKneeX: 0,
  mouth: 0.18,
};

function motionForState(
  state: CharacterAnimationState,
  wave: number,
  beat: number,
  seated: boolean,
): MotionTargets {
  const next = { ...BASE_TARGETS };
  const seat = () => {
    next.leftLegX = -1.35;
    next.rightLegX = -1.35;
    next.leftKneeX = 1.35;
    next.rightKneeX = 1.35;
  };
  if (seated) seat();

  switch (state) {
    case 'SEATED_IDLE':
      seat();
      next.headY = wave * 0.035;
      break;
    case 'LOOK_AT_STAGE':
      next.headX = -0.08;
      next.headY = wave * 0.055;
      break;
    case 'LOOK_AT_CARD':
    case 'MARK_NUMBER':
      seat();
      next.torsoX = 0.12;
      next.headX = 0.3;
      next.rightArmX = state === 'MARK_NUMBER' ? -1.12 + beat * 0.12 : -0.7;
      next.rightArmZ = -0.08;
      break;
    case 'TALK':
      next.headY = wave * 0.14;
      next.leftArmX = -0.55 + beat * 0.16;
      next.leftArmZ = 0.36;
      next.mouth = 0.45 + beat * 0.35;
      break;
    case 'LAUGH':
      next.torsoX = -0.08 + Math.abs(wave) * 0.08;
      next.headX = -0.14;
      next.leftArmZ = 0.42;
      next.rightArmZ = -0.42;
      next.mouth = 0.72;
      break;
    case 'CELEBRATE':
      next.rootY = Math.max(0, beat) * 0.05;
      next.torsoX = -0.1;
      next.leftArmX = -2.55 + wave * 0.08;
      next.rightArmX = -2.55 - wave * 0.08;
      next.leftArmZ = 0.34;
      next.rightArmZ = -0.34;
      next.mouth = 0.8;
      break;
    case 'DISAPPOINTED':
      next.torsoX = 0.2;
      next.headX = 0.32;
      next.leftArmX = -0.02;
      next.rightArmX = -0.02;
      next.mouth = 0.1;
      break;
    case 'SCARED':
      next.rootY = Math.abs(beat) * 0.035;
      next.headX = -0.08;
      next.leftArmX = -1.55;
      next.rightArmX = -1.55;
      next.leftArmZ = 0.48;
      next.rightArmZ = -0.48;
      next.mouth = 0.7;
      break;
    case 'ARGUE':
      next.torsoX = -0.04;
      next.headY = wave * 0.19;
      next.rightArmX = -1.05 + beat * 0.26;
      next.rightArmZ = -0.62;
      next.mouth = 0.52 + beat * 0.25;
      break;
    case 'STAND_UP':
      next.rootY = Math.max(0, beat) * 0.015;
      break;
    case 'WALK':
      next.rootY = Math.abs(beat) * 0.022;
      next.leftArmX = wave * 0.5;
      next.rightArmX = -wave * 0.5;
      next.leftLegX = -wave * 0.62;
      next.rightLegX = wave * 0.62;
      next.leftKneeX = Math.max(0, wave) * 0.35;
      next.rightKneeX = Math.max(0, -wave) * 0.35;
      break;
    case 'RUN':
      next.rootY = Math.abs(beat) * 0.045;
      next.torsoX = -0.1;
      next.leftArmX = wave * 0.82;
      next.rightArmX = -wave * 0.82;
      next.leftLegX = -wave * 0.92;
      next.rightLegX = wave * 0.92;
      next.leftKneeX = Math.max(0, wave) * 0.62;
      next.rightKneeX = Math.max(0, -wave) * 0.62;
      break;
    case 'ZOMBIE_IDLE':
    case 'ZOMBIE_MOVE':
    case 'ZOMBIE_FEED':
      next.torsoX = 0.18;
      next.headY = wave * 0.18;
      next.leftArmX = -1.48;
      next.rightArmX = -1.48;
      next.mouth = state === 'ZOMBIE_FEED' ? 0.9 : 0.52;
      break;
    case 'RETURN_TO_SEAT':
      seat();
      next.rootY = Math.max(0, wave) * 0.08;
      next.torsoX = 0.08;
      break;
    default:
      next.headY = wave * 0.035;
      break;
  }
  return next;
}

function Hair({ appearance }: { appearance: AvatarAppearance }) {
  const material = <meshStandardMaterial color={appearance.hairColor} roughness={0.9} />;

  if (appearance.hairStyle === 'buzz') {
    return (
      <mesh position={[0, 0.165, -0.012]} scale={[1.01, 0.48, 1.01]} castShadow>
        <sphereGeometry args={[0.205, 18, 12]} />
        {material}
      </mesh>
    );
  }

  if (appearance.hairStyle === 'curly') {
    return (
      <group position={[0, 0.16, -0.015]}>
        {[
          [-0.13, 0, 0],
          [0, 0.055, -0.025],
          [0.13, 0, 0],
          [-0.065, 0.075, -0.02],
          [0.065, 0.075, -0.02],
        ].map((position, index) => (
          <mesh key={index} position={position as Vector3Tuple} castShadow>
            <sphereGeometry args={[0.105, 12, 9]} />
            <meshStandardMaterial color={appearance.hairColor} roughness={0.94} />
          </mesh>
        ))}
      </group>
    );
  }

  if (appearance.hairStyle === 'bob' || appearance.hairStyle === 'long') {
    const long = appearance.hairStyle === 'long';
    return (
      <>
        <mesh position={[0, long ? -0.05 : 0.02, -0.115]} scale={[1.16, long ? 1.7 : 1.18, 0.78]} castShadow>
          <sphereGeometry args={[0.22, 18, 12]} />
          <meshStandardMaterial color={appearance.hairColor} roughness={0.92} />
        </mesh>
        <mesh position={[0, 0.165, -0.005]} scale={[1.08, 0.5, 1.04]} castShadow>
          <sphereGeometry args={[0.21, 18, 12]} />
          <meshStandardMaterial color={appearance.hairColor} roughness={0.9} />
        </mesh>
      </>
    );
  }

  return (
    <>
      <mesh position={[0, 0.17, -0.012]} scale={[1.08, 0.55, 1.04]} castShadow>
        <sphereGeometry args={[0.205, 18, 12]} />
        {material}
      </mesh>
      <mesh position={[-0.11, 0.2, 0.02]} rotation={[0.1, 0, -0.35]} castShadow>
        <coneGeometry args={[0.075, 0.18, 8]} />
        <meshStandardMaterial color={appearance.hairColor} roughness={0.92} />
      </mesh>
    </>
  );
}

function Arm({
  side,
  skinTone,
  shirtColor,
  armRef,
}: {
  side: -1 | 1;
  skinTone: string;
  shirtColor: string;
  armRef: React.RefObject<THREE.Group | null>;
}) {
  return (
    <group ref={armRef} position={[side * 0.34, 1.39, 0]}>
      <mesh position={[0, -0.22, 0]} castShadow>
        <capsuleGeometry args={[0.075, 0.31, 5, 10]} />
        <meshStandardMaterial color={shirtColor} roughness={0.78} />
      </mesh>
      <group position={[0, -0.45, 0]} rotation={[-0.42, 0, side * 0.05]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <capsuleGeometry args={[0.062, 0.25, 5, 10]} />
          <meshStandardMaterial color={skinTone} roughness={0.86} />
        </mesh>
        <mesh position={[0, -0.38, 0.015]} scale={[0.82, 1.12, 0.62]} castShadow>
          <sphereGeometry args={[0.09, 12, 9]} />
          <meshStandardMaterial color={skinTone} roughness={0.88} />
        </mesh>
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
}: ProceduralCharacterProps) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftKnee = useRef<THREE.Group>(null);
  const rightKnee = useRef<THREE.Group>(null);
  const baseY = position[1];
  const bodyWidth = BODY_WIDTH[appearance.bodyType];
  const heightScale = THREE.MathUtils.clamp(appearance.heightCm / 175, 0.82, 1.18);
  const finalScale = scale * heightScale;
  const motionSpeed = PERSONALITY_SPEED[personality];
  const skinMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: appearance.skinTone, roughness: 0.88 }),
    [appearance.skinTone],
  );

  useFrame(({ clock }, delta) => {
    if (
      !root.current ||
      !torso.current ||
      !head.current ||
      !leftArm.current ||
      !rightArm.current ||
      !leftLeg.current ||
      !rightLeg.current ||
      !leftKnee.current ||
      !rightKnee.current
    ) return;
    const time = clock.elapsedTime * motionSpeed + phase;
    const wave = reducedMotion ? 0 : Math.sin(time);
    const beat = reducedMotion ? 0 : Math.sin(time * 2.1);
    const targets = motionForState(state, wave, beat, seated);
    const damping = reducedMotion ? 28 : 9;
    const breathing = reducedMotion ? 0 : Math.sin(time * 1.15) * 0.008;

    root.current.position.y = THREE.MathUtils.damp(root.current.position.y, baseY + targets.rootY + breathing, damping, delta);
    torso.current.rotation.x = THREE.MathUtils.damp(torso.current.rotation.x, targets.torsoX, damping, delta);
    torso.current.rotation.z = THREE.MathUtils.damp(torso.current.rotation.z, targets.torsoZ + wave * 0.012, damping, delta);
    head.current.rotation.x = THREE.MathUtils.damp(head.current.rotation.x, targets.headX, damping, delta);
    head.current.rotation.y = THREE.MathUtils.damp(head.current.rotation.y, targets.headY, damping, delta);
    leftArm.current.rotation.x = THREE.MathUtils.damp(leftArm.current.rotation.x, targets.leftArmX, damping, delta);
    leftArm.current.rotation.z = THREE.MathUtils.damp(leftArm.current.rotation.z, targets.leftArmZ, damping, delta);
    rightArm.current.rotation.x = THREE.MathUtils.damp(rightArm.current.rotation.x, targets.rightArmX, damping, delta);
    rightArm.current.rotation.z = THREE.MathUtils.damp(rightArm.current.rotation.z, targets.rightArmZ, damping, delta);
    leftLeg.current.rotation.x = THREE.MathUtils.damp(leftLeg.current.rotation.x, targets.leftLegX, damping, delta);
    rightLeg.current.rotation.x = THREE.MathUtils.damp(rightLeg.current.rotation.x, targets.rightLegX, damping, delta);
    leftKnee.current.rotation.x = THREE.MathUtils.damp(leftKnee.current.rotation.x, targets.leftKneeX, damping, delta);
    rightKnee.current.rotation.x = THREE.MathUtils.damp(rightKnee.current.rotation.x, targets.rightKneeX, damping, delta);
    if (mouth.current) {
      mouth.current.scale.y = THREE.MathUtils.damp(mouth.current.scale.y, targets.mouth, 15, delta);
    }
  });

  return (
    <group
      ref={root}
      position={position}
      rotation={[0, rotationY, 0]}
      scale={[finalScale, finalScale, finalScale]}
    >
      <group ref={torso}>
        <mesh position={[0, 0.78, 0]} scale={[bodyWidth, 1, 1]} castShadow>
          <capsuleGeometry args={[0.22, 0.25, 7, 14]} />
          <meshStandardMaterial color={appearance.pantsColor} roughness={0.8} />
        </mesh>
        <RoundedBox args={[0.62 * bodyWidth, 0.7, 0.32]} radius={0.16} smoothness={3} position={[0, 1.25, 0]} castShadow>
          <meshStandardMaterial color={appearance.shirtColor} roughness={0.72} />
        </RoundedBox>
        <mesh position={[0, 1.58, 0]} castShadow>
          <cylinderGeometry args={[0.105, 0.12, 0.18, 16]} />
          <primitive object={skinMaterial} attach="material" />
        </mesh>

        <Arm side={-1} skinTone={appearance.skinTone} shirtColor={appearance.shirtColor} armRef={leftArm} />
        <Arm side={1} skinTone={appearance.skinTone} shirtColor={appearance.shirtColor} armRef={rightArm} />

        {([-1, 1] as const).map((side) => (
          <group
            key={side}
            ref={side === -1 ? leftLeg : rightLeg}
            position={[side * 0.16 * bodyWidth, 0.68, 0]}
          >
            <mesh position={[0, -0.23, 0]} castShadow>
              <capsuleGeometry args={[0.095, 0.32, 6, 12]} />
              <meshStandardMaterial color={appearance.pantsColor} roughness={0.82} />
            </mesh>
            <group ref={side === -1 ? leftKnee : rightKnee} position={[0, -0.48, 0]}>
              <mesh position={[0, -0.2, 0]} castShadow>
                <capsuleGeometry args={[0.085, 0.29, 6, 12]} />
                <meshStandardMaterial color={appearance.pantsColor} roughness={0.84} />
              </mesh>
              <RoundedBox args={[0.2, 0.12, 0.34]} radius={0.06} smoothness={2} position={[0, -0.42, 0.08]} castShadow>
                <meshStandardMaterial color="#17151d" roughness={0.78} />
              </RoundedBox>
            </group>
          </group>
        ))}

        <group ref={head} position={[0, 1.89, 0]}>
          <mesh scale={[0.88, 1.04, 0.9]} castShadow>
            <sphereGeometry args={[0.235, 22, 16]} />
            <primitive object={skinMaterial} attach="material" />
          </mesh>
          <Hair appearance={appearance} />
          {([-1, 1] as const).map((side) => (
            <group key={side} position={[side * 0.083, 0.035, 0.205]}>
              <mesh scale={[1, 0.72, 0.45]}>
                <sphereGeometry args={[0.028, 10, 8]} />
                <meshStandardMaterial color="#f7f3ef" roughness={0.5} />
              </mesh>
              <mesh position={[0, 0, 0.017]}>
                <sphereGeometry args={[0.011, 8, 6]} />
                <meshStandardMaterial color="#261d24" roughness={0.4} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, -0.025, 0.225]} scale={[0.7, 1, 0.72]} castShadow>
            <sphereGeometry args={[0.032, 10, 8]} />
            <primitive object={skinMaterial} attach="material" />
          </mesh>
          <mesh ref={mouth} position={[0, -0.095, 0.218]} scale={[1, 0.18, 0.35]}>
            <sphereGeometry args={[0.052, 12, 8]} />
            <meshStandardMaterial color="#6f3440" roughness={0.65} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
