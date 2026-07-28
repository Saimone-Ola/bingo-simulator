import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Instance, Instances } from '@react-three/drei';
import { Object3D, Vector3 } from 'three';
import { AVATAR_EYE_HEIGHT, HUB_MAX_AVATARS } from '@bingo/shared';
import { getRoom } from '../net/hubConnection';
import { useHubStore } from '../store/hub';
import { localPlayer } from './localPlayer';
import { LABEL_MAX_DISTANCE, labelAnchors } from './labels';

/**
 * Every avatar in the hub, drawn as three instanced meshes.
 *
 * The performance budget for phase 1 is 20 avatars at 60 FPS on an ordinary
 * laptop. The way that is met is draw calls, not triangles: an avatar is about
 * 250 triangles, so twenty of them are nothing, but twenty separate meshes
 * would be sixty draw calls plus sixty material binds. Instancing collapses
 * the whole crowd to three.
 *
 * Two levels of detail, by distance from the camera: past `ANIMATE_DISTANCE`
 * the walk cycle stops being computed (the pose is imperceptible at that
 * range), and past `CULL_DISTANCE` the avatar is hidden entirely.
 */
const ANIMATE_DISTANCE = 28;
const CULL_DISTANCE = 48;

/** How fast a remote avatar's position converges on the server snapshot. */
const SMOOTHING_RATE = 14;

interface Smoothed {
  x: number;
  z: number;
  rotY: number;
}

/** Shortest-arc angle interpolation: without it avatars spin the long way. */
function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export default function Crowd() {
  const players = useHubStore((state) => state.players);
  const mySessionId = useHubStore((state) => state.mySessionId);

  // Instance handles, registered by ref callback as React adds and removes
  // avatars. Positions are written imperatively; React never sees them.
  const legs = useRef(new Map<string, Object3D>());
  const torsos = useRef(new Map<string, Object3D>());
  const heads = useRef(new Map<string, Object3D>());
  const smoothed = useRef(new Map<string, Smoothed>());

  const { camera } = useThree();
  const projected = useMemo(() => new Vector3(), []);

  // Drop smoothing state for players who left, or it leaks for the session.
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
      const leg = legs.current.get(sessionId);
      const torso = torsos.current.get(sessionId);
      const head = heads.current.get(sessionId);
      if (!remote || !leg || !torso || !head) continue;

      const isSelf = sessionId === mySessionId;

      let pose = smoothed.current.get(sessionId);
      if (!pose) {
        pose = { x: remote.x, z: remote.z, rotY: remote.rotY };
        smoothed.current.set(sessionId, pose);
      }

      if (isSelf) {
        // Own avatar follows the local prediction, not the snapshot: waiting a
        // round trip to see your own step is what makes a hub feel broken.
        pose.x = localPlayer.x;
        pose.z = localPlayer.z;
        pose.rotY = localPlayer.rotY;
      } else {
        // Snapshots arrive at 20 Hz and we draw at 60: without smoothing the
        // crowd visibly steps.
        pose.x = damp(pose.x, remote.x, SMOOTHING_RATE, dt);
        pose.z = damp(pose.z, remote.z, SMOOTHING_RATE, dt);
        pose.rotY = dampAngle(pose.rotY, remote.rotY, SMOOTHING_RATE, dt);
      }

      const scale = remote.heightCm / 175;
      const distance = Math.hypot(camera.position.x - pose.x, camera.position.z - pose.z);

      const visible = distance < CULL_DISTANCE;
      leg.visible = visible;
      torso.visible = visible;
      head.visible = visible;
      if (!visible) {
        labelAnchors.set(sessionId, { x: 0, y: 0, visible: false, distance });
        continue;
      }

      const moving = isSelf ? localPlayer.moving : remote.moving;
      const running = isSelf ? localPlayer.running : remote.running;
      const animate = distance < ANIMATE_DISTANCE;

      // Emotes are expressed through body motion: the avatar has no arms yet,
      // and a readable whole-body gesture beats an invisible limb.
      let bob = 0;
      let legSwing = 0;
      let spin = 0;
      let crouch = 0;

      if (animate) {
        const emote = remote.emote;
        if (emote === 'dance') {
          spin = time * 3;
          bob = Math.abs(Math.sin(time * 6)) * 0.12;
        } else if (emote === 'cheer' || emote === 'clap') {
          bob = Math.abs(Math.sin(time * 9)) * 0.16;
        } else if (emote === 'wave' || emote === 'laugh') {
          bob = Math.sin(time * 7) * 0.05;
        } else if (emote === 'sit') {
          crouch = 0.45;
        } else if (moving) {
          const cadence = running ? 13 : 8;
          bob = Math.abs(Math.sin(time * cadence)) * 0.06;
          legSwing = Math.sin(time * cadence) * 0.5;
        }
      }

      const baseY = -crouch;

      leg.position.set(pose.x, (0.4 + baseY) * scale, pose.z);
      leg.rotation.set(legSwing * 0.35, pose.rotY, 0);
      leg.scale.setScalar(scale);

      torso.position.set(pose.x, (1.05 + bob + baseY) * scale, pose.z);
      torso.rotation.set(0, pose.rotY + spin, 0);
      torso.scale.setScalar(scale);

      head.position.set(pose.x, (1.62 + bob + baseY) * scale, pose.z);
      head.rotation.set(0, pose.rotY + spin, 0);
      head.scale.setScalar(scale);

      // One projection pass for the whole crowd, feeding the DOM label layer.
      if (distance < LABEL_MAX_DISTANCE) {
        projected.set(pose.x, (AVATAR_EYE_HEIGHT + 0.45 + baseY) * scale, pose.z);
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
      {/* Legs */}
      <Instances limit={HUB_MAX_AVATARS} castShadow receiveShadow>
        <boxGeometry args={[0.42, 0.8, 0.28]} />
        <meshStandardMaterial roughness={0.75} />
        {players.map((player) => (
          <Instance
            key={player.sessionId}
            ref={register(legs, player.sessionId)}
            color={room?.state.players.get(player.sessionId)?.pantsColor ?? '#4a4585'}
          />
        ))}
      </Instances>

      {/* Torso */}
      <Instances limit={HUB_MAX_AVATARS} castShadow receiveShadow>
        <boxGeometry args={[0.56, 0.72, 0.32]} />
        <meshStandardMaterial roughness={0.6} />
        {players.map((player) => (
          <Instance
            key={player.sessionId}
            ref={register(torsos, player.sessionId)}
            color={room?.state.players.get(player.sessionId)?.shirtColor ?? '#7c5cff'}
          />
        ))}
      </Instances>

      {/* Head */}
      <Instances limit={HUB_MAX_AVATARS} castShadow>
        <sphereGeometry args={[0.23, 12, 10]} />
        <meshStandardMaterial roughness={0.5} />
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
