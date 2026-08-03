import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Instance, Instances } from '@react-three/drei';
import { Object3D, Vector3 } from 'three';
import { AVATAR_EYE_HEIGHT, HUB_MAX_AVATARS } from '@bingo/shared';
import { getRoom } from '../net/hubConnection';
import { useHubStore } from '../store/hub';
import { localPlayer } from './localPlayer';
import { LABEL_MAX_DISTANCE, labelAnchors } from './labels';

const ANIMATE_DISTANCE = 28;
const CULL_DISTANCE = 48;
const SMOOTHING_RATE = 14;

interface Smoothed {
  x: number;
  z: number;
  rotY: number;
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

/**
 * Low-poly multiplayer avatars. The body is split into six instanced parts:
 * this keeps the crowd inexpensive while reading as a character rather than
 * the three stacked blocks used by the prototype.
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
      if (!remote || !leftLeg || !rightLeg || !torso || !leftArm || !rightArm || !head) {
        continue;
      }

      const isSelf = sessionId === mySessionId;
      let pose = smoothed.current.get(sessionId);
      if (!pose) {
        pose = { x: remote.x, z: remote.z, rotY: remote.rotY };
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
      const distance = Math.hypot(camera.position.x - pose.x, camera.position.z - pose.z);
      const parts = [leftLeg, rightLeg, torso, leftArm, rightArm, head];
      const visible = distance < CULL_DISTANCE;
      for (const part of parts) part.visible = visible;

      if (!visible) {
        labelAnchors.set(sessionId, { x: 0, y: 0, visible: false, distance });
        continue;
      }

      const moving = isSelf ? localPlayer.moving : remote.moving;
      const running = isSelf ? localPlayer.running : remote.running;
      const animate = distance < ANIMATE_DISTANCE;

      let bob = 0;
      let legSwing = 0;
      let spin = 0;
      let crouch = 0;
      let cheer = 0;

      if (animate) {
        const emote = remote.emote;
        if (emote === 'dance') {
          spin = time * 3;
          bob = Math.abs(Math.sin(time * 6)) * 0.12;
          cheer = Math.sin(time * 6) * 0.35;
        } else if (emote === 'cheer' || emote === 'clap') {
          bob = Math.abs(Math.sin(time * 9)) * 0.16;
          cheer = 1.15;
        } else if (emote === 'wave') {
          cheer = 0.8 + Math.sin(time * 9) * 0.45;
        } else if (emote === 'laugh') {
          bob = Math.sin(time * 7) * 0.05;
        } else if (emote === 'sit') {
          crouch = 0.42;
        } else if (moving) {
          const cadence = running ? 13 : 8;
          bob = Math.abs(Math.sin(time * cadence)) * 0.06;
          legSwing = Math.sin(time * cadence) * 0.72;
        }
      }

      const baseY = -crouch;
      const bodyRotation = pose.rotY + spin;
      const sideX = Math.cos(bodyRotation);
      const sideZ = -Math.sin(bodyRotation);

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
      leftLeg.rotation.set(legSwing * 0.45, bodyRotation, 0.04);
      rightLeg.rotation.set(-legSwing * 0.45, bodyRotation, -0.04);
      leftLeg.scale.setScalar(scale);
      rightLeg.scale.setScalar(scale);

      torso.position.set(pose.x, (1.04 + bob + baseY) * scale, pose.z);
      torso.rotation.set(0, bodyRotation, 0);
      torso.scale.setScalar(scale);

      leftArm.position.set(
        pose.x - sideX * 0.4 * scale,
        (1.12 + bob + baseY + cheer * 0.08) * scale,
        pose.z - sideZ * 0.4 * scale,
      );
      rightArm.position.set(
        pose.x + sideX * 0.4 * scale,
        (1.12 + bob + baseY + Math.abs(cheer) * 0.08) * scale,
        pose.z + sideZ * 0.4 * scale,
      );
      leftArm.rotation.set(-legSwing * 0.28 - cheer, bodyRotation, 0.08);
      rightArm.rotation.set(legSwing * 0.28 + Math.abs(cheer), bodyRotation, -0.08);
      leftArm.scale.setScalar(scale);
      rightArm.scale.setScalar(scale);

      head.position.set(pose.x, (1.66 + bob + baseY) * scale, pose.z);
      head.rotation.set(0, bodyRotation, 0);
      head.scale.setScalar(scale);

      if (distance < LABEL_MAX_DISTANCE) {
        projected.set(pose.x, (AVATAR_EYE_HEIGHT + 0.55 + baseY) * scale, pose.z);
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
    </group>
  );
}
