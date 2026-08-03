import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Instance, Instances } from '@react-three/drei';
import { Object3D, Vector3 } from 'three';
import { AVATAR_EYE_HEIGHT, HUB_MAX_AVATARS } from '@bingo/shared';
import { getRoom } from '../net/hubConnection';
import { useHubStore } from '../store/hub';
import { localPlayer } from './localPlayer';
import { LABEL_MAX_DISTANCE, labelAnchors } from './labels';

const ANIMATE_DISTANCE = 32;
const CULL_DISTANCE = 50;
const SMOOTHING_RATE = 14;

interface Smoothed {
  x: number;
  z: number;
  rotY: number;
  motion: number;
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function phaseFor(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return (Math.abs(hash) % 628) / 100;
}

const BODY_WIDTH: Record<string, number> = {
  neutral: 1,
  slim: 0.84,
  athletic: 1.18,
  curvy: 1.12,
};

const HAIR_SHAPE: Record<string, { x: number; y: number; z: number; offset: number }> = {
  short: { x: 1.08, y: 0.58, z: 1.04, offset: 0.13 },
  buzz: { x: 1.02, y: 0.34, z: 1.01, offset: 0.17 },
  bob: { x: 1.17, y: 1.02, z: 1.12, offset: 0.02 },
  curly: { x: 1.2, y: 0.78, z: 1.16, offset: 0.12 },
  long: { x: 1.18, y: 1.55, z: 1.08, offset: -0.08 },
};

/**
 * Instanced low-poly avatars with a real character silhouette: articulated
 * limbs, body proportions, hair, eyes and eased movement. All parts still
 * batch by geometry, keeping the plaza within the 60 FPS crowd budget.
 */
export default function Crowd() {
  const players = useHubStore((state) => state.players);
  const mySessionId = useHubStore((state) => state.mySessionId);

  const leftLegs = useRef(new Map<string, Object3D>());
  const rightLegs = useRef(new Map<string, Object3D>());
  const torsos = useRef(new Map<string, Object3D>());
  const leftArms = useRef(new Map<string, Object3D>());
  const rightArms = useRef(new Map<string, Object3D>());
  const heads = useRef(new Map<string, Object3D>());
  const hairs = useRef(new Map<string, Object3D>());
  const leftEyes = useRef(new Map<string, Object3D>());
  const rightEyes = useRef(new Map<string, Object3D>());
  const smoothed = useRef(new Map<string, Smoothed>());

  const { camera } = useThree();
  const projected = useMemo(() => new Vector3(), []);

  useEffect(() => {
    const live = new Set(players.map((player) => player.sessionId));
    for (const key of smoothed.current.keys()) {
      if (!live.has(key)) smoothed.current.delete(key);
    }
    for (const key of labelAnchors.keys()) {
      if (!live.has(key)) labelAnchors.delete(key);
    }
  }, [players]);

  useFrame((state, rawDelta) => {
    const room = getRoom();
    if (!room) return;

    const dt = Math.min(rawDelta, 0.1);
    const time = state.clock.elapsedTime;

    for (const card of players) {
      const sessionId = card.sessionId;
      const remote = room.state.players.get(sessionId);
      const leftLeg = leftLegs.current.get(sessionId);
      const rightLeg = rightLegs.current.get(sessionId);
      const torso = torsos.current.get(sessionId);
      const leftArm = leftArms.current.get(sessionId);
      const rightArm = rightArms.current.get(sessionId);
      const head = heads.current.get(sessionId);
      const hair = hairs.current.get(sessionId);
      const leftEye = leftEyes.current.get(sessionId);
      const rightEye = rightEyes.current.get(sessionId);
      if (
        !remote ||
        !leftLeg ||
        !rightLeg ||
        !torso ||
        !leftArm ||
        !rightArm ||
        !head ||
        !hair ||
        !leftEye ||
        !rightEye
      ) {
        continue;
      }

      const isSelf = sessionId === mySessionId;
      let pose = smoothed.current.get(sessionId);
      if (!pose) {
        pose = { x: remote.x, z: remote.z, rotY: remote.rotY, motion: 0 };
        smoothed.current.set(sessionId, pose);
      }

      if (isSelf) {
        pose.x = localPlayer.x;
        pose.z = localPlayer.z;
        pose.rotY = localPlayer.rotY;
      } else {
        pose.x = damp(pose.x, remote.x, SMOOTHING_RATE, dt);
        pose.z = damp(pose.z, remote.z, SMOOTHING_RATE, dt);
        pose.rotY = dampAngle(pose.rotY, remote.rotY, SMOOTHING_RATE, dt);
      }

      const scale = remote.heightCm / 175;
      const bodyWidth = BODY_WIDTH[remote.bodyType] ?? 1;
      const distance = Math.hypot(camera.position.x - pose.x, camera.position.z - pose.z);
      const parts = [
        leftLeg,
        rightLeg,
        torso,
        leftArm,
        rightArm,
        head,
        hair,
        leftEye,
        rightEye,
      ];
      const visible = distance < CULL_DISTANCE;
      for (const part of parts) part.visible = visible;

      if (!visible) {
        labelAnchors.set(sessionId, { x: 0, y: 0, visible: false, distance });
        continue;
      }

      const moving = isSelf ? localPlayer.moving : remote.moving;
      const running = isSelf ? localPlayer.running : remote.running;
      const motionTarget = moving ? (running ? 1 : 0.64) : 0;
      pose.motion = damp(pose.motion, motionTarget, moving ? 11 : 7, dt);

      const animate = distance < ANIMATE_DISTANCE;
      const phase = phaseFor(sessionId);
      const cadence = running ? 13.2 : 8.2;
      const step = Math.sin(time * cadence + phase) * pose.motion;

      let bob = animate ? Math.abs(Math.sin(time * cadence + phase)) * 0.065 * pose.motion : 0;
      let legSwing = animate ? step * 0.78 : 0;
      let spin = 0;
      let crouch = 0;
      let leftGesture = 0;
      let rightGesture = 0;
      let sway = animate ? Math.sin(time * 1.8 + phase) * 0.012 : 0;
      let lean = -0.08 * pose.motion;

      if (animate) {
        const emote = remote.emote;
        if (emote === 'dance') {
          spin = time * 3.1;
          bob = Math.abs(Math.sin(time * 6.2 + phase)) * 0.13;
          leftGesture = Math.sin(time * 6.2) * 0.55;
          rightGesture = -leftGesture;
          sway = Math.sin(time * 4.4) * 0.16;
          lean = 0;
        } else if (emote === 'cheer') {
          bob = Math.abs(Math.sin(time * 9)) * 0.16;
          leftGesture = 1.25;
          rightGesture = 1.25;
          lean = 0;
        } else if (emote === 'clap') {
          leftGesture = 0.75 + Math.sin(time * 11) * 0.35;
          rightGesture = 0.75 + Math.sin(time * 11) * 0.35;
          lean = 0;
        } else if (emote === 'wave') {
          rightGesture = 1.08 + Math.sin(time * 10) * 0.45;
          lean = 0;
        } else if (emote === 'laugh') {
          bob = Math.sin(time * 7) * 0.045;
          lean = Math.sin(time * 7) * 0.08;
        } else if (emote === 'sit') {
          crouch = 0.42;
          legSwing = -0.62;
          lean = 0.08;
        }
      }

      // A tiny per-avatar idle breath prevents a connected crowd from looking
      // frozen without producing distracting motion.
      const breathe = animate ? Math.sin(time * 2.05 + phase) * 0.012 * (1 - pose.motion) : 0;
      const baseY = -crouch;
      const bodyRotation = pose.rotY + spin;
      const sideX = Math.cos(bodyRotation);
      const sideZ = -Math.sin(bodyRotation);
      const frontX = Math.sin(bodyRotation);
      const frontZ = Math.cos(bodyRotation);
      const armOffset = 0.4 * bodyWidth;

      leftLeg.position.set(
        pose.x - sideX * 0.15 * scale,
        (0.38 + baseY) * scale,
        pose.z - sideZ * 0.15 * scale,
      );
      rightLeg.position.set(
        pose.x + sideX * 0.15 * scale,
        (0.38 + baseY) * scale,
        pose.z + sideZ * 0.15 * scale,
      );
      leftLeg.rotation.set(legSwing * 0.48, bodyRotation, 0.04);
      rightLeg.rotation.set(-legSwing * 0.48, bodyRotation, -0.04);
      leftLeg.scale.setScalar(scale);
      rightLeg.scale.setScalar(scale);

      torso.position.set(pose.x, (1.04 + bob + breathe + baseY) * scale, pose.z);
      torso.rotation.set(lean, bodyRotation, sway);
      torso.scale.set(bodyWidth * scale, scale, (0.96 + bodyWidth * 0.04) * scale);

      leftArm.position.set(
        pose.x - sideX * armOffset * scale,
        (1.12 + bob + breathe + baseY + Math.abs(leftGesture) * 0.08) * scale,
        pose.z - sideZ * armOffset * scale,
      );
      rightArm.position.set(
        pose.x + sideX * armOffset * scale,
        (1.12 + bob + breathe + baseY + Math.abs(rightGesture) * 0.08) * scale,
        pose.z + sideZ * armOffset * scale,
      );
      leftArm.rotation.set(-legSwing * 0.3 - leftGesture, bodyRotation, 0.08);
      rightArm.rotation.set(legSwing * 0.3 + rightGesture, bodyRotation, -0.08);
      leftArm.scale.setScalar(scale);
      rightArm.scale.setScalar(scale);

      const headY = (1.66 + bob + breathe + baseY) * scale;
      head.position.set(pose.x, headY, pose.z);
      head.rotation.set(lean * 0.3, bodyRotation, sway * 0.5);
      head.scale.setScalar(scale);

      const hairShape = HAIR_SHAPE[remote.hairStyle] ?? HAIR_SHAPE.short!;
      hair.position.set(pose.x, headY + hairShape.offset * scale, pose.z);
      hair.rotation.set(0, bodyRotation, sway * 0.35);
      hair.scale.set(
        hairShape.x * scale,
        hairShape.y * scale,
        hairShape.z * scale,
      );

      const eyeY = headY + 0.025 * scale;
      const eyeForward = 0.222 * scale;
      const eyeSide = 0.083 * scale;
      leftEye.position.set(
        pose.x + frontX * eyeForward - sideX * eyeSide,
        eyeY,
        pose.z + frontZ * eyeForward - sideZ * eyeSide,
      );
      rightEye.position.set(
        pose.x + frontX * eyeForward + sideX * eyeSide,
        eyeY,
        pose.z + frontZ * eyeForward + sideZ * eyeSide,
      );
      leftEye.scale.setScalar(scale);
      rightEye.scale.setScalar(scale);

      if (distance < LABEL_MAX_DISTANCE) {
        projected.set(pose.x, (AVATAR_EYE_HEIGHT + 0.62 + baseY) * scale, pose.z);
        projected.project(camera);
        labelAnchors.set(sessionId, {
          x: (projected.x * 0.5 + 0.5) * state.size.width,
          y: (-projected.y * 0.5 + 0.5) * state.size.height,
          visible: projected.z < 1,
          distance,
        });
      } else {
        labelAnchors.set(sessionId, { x: 0, y: 0, visible: false, distance });
      }
    }
  });

  const register = (map: React.RefObject<Map<string, Object3D>>, sessionId: string) => {
    return (instance: Object3D | null) => {
      if (instance) map.current.set(sessionId, instance);
      else map.current.delete(sessionId);
    };
  };

  const room = getRoom();

  return (
    <group>
      <Instances limit={HUB_MAX_AVATARS * 2} castShadow receiveShadow>
        <capsuleGeometry args={[0.14, 0.5, 4, 8]} />
        <meshStandardMaterial roughness={0.64} />
        {players.flatMap((player) => {
          const color = room?.state.players.get(player.sessionId)?.pantsColor ?? '#4a4585';
          return [
            <Instance key={`${player.sessionId}-left-leg`} ref={register(leftLegs, player.sessionId)} color={color} />,
            <Instance key={`${player.sessionId}-right-leg`} ref={register(rightLegs, player.sessionId)} color={color} />,
          ];
        })}
      </Instances>

      <Instances limit={HUB_MAX_AVATARS} castShadow receiveShadow>
        <capsuleGeometry args={[0.3, 0.38, 5, 10]} />
        <meshStandardMaterial roughness={0.5} metalness={0.04} />
        {players.map((player) => (
          <Instance
            key={player.sessionId}
            ref={register(torsos, player.sessionId)}
            color={room?.state.players.get(player.sessionId)?.shirtColor ?? '#7c5cff'}
          />
        ))}
      </Instances>

      <Instances limit={HUB_MAX_AVATARS * 2} castShadow>
        <capsuleGeometry args={[0.095, 0.42, 4, 8]} />
        <meshStandardMaterial roughness={0.58} />
        {players.flatMap((player) => {
          const color = room?.state.players.get(player.sessionId)?.shirtColor ?? '#7c5cff';
          return [
            <Instance key={`${player.sessionId}-left-arm`} ref={register(leftArms, player.sessionId)} color={color} />,
            <Instance key={`${player.sessionId}-right-arm`} ref={register(rightArms, player.sessionId)} color={color} />,
          ];
        })}
      </Instances>

      <Instances limit={HUB_MAX_AVATARS} castShadow>
        <sphereGeometry args={[0.24, 18, 14]} />
        <meshStandardMaterial roughness={0.46} />
        {players.map((player) => (
          <Instance
            key={player.sessionId}
            ref={register(heads, player.sessionId)}
            color={room?.state.players.get(player.sessionId)?.skinTone ?? '#e0b49a'}
          />
        ))}
      </Instances>

      <Instances limit={HUB_MAX_AVATARS} castShadow>
        <sphereGeometry args={[0.245, 16, 12]} />
        <meshStandardMaterial roughness={0.72} />
        {players.map((player) => (
          <Instance
            key={player.sessionId}
            ref={register(hairs, player.sessionId)}
            color={room?.state.players.get(player.sessionId)?.hairColor ?? '#2b2118'}
          />
        ))}
      </Instances>

      <Instances limit={HUB_MAX_AVATARS * 2}>
        <sphereGeometry args={[0.031, 8, 6]} />
        <meshStandardMaterial color="#21172b" roughness={0.3} />
        {players.flatMap((player) => [
          <Instance key={`${player.sessionId}-left-eye`} ref={register(leftEyes, player.sessionId)} />,
          <Instance key={`${player.sessionId}-right-eye`} ref={register(rightEyes, player.sessionId)} />,
        ])}
      </Instances>
    </group>
  );
}
