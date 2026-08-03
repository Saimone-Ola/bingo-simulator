import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import {
  AVATAR_EYE_HEIGHT,
  AVATAR_RUN_SPEED,
  AVATAR_WALK_SPEED,
  HUB_TICK_MS,
  resolvePosition,
} from '@bingo/shared';
import { getRoom, sendMoveIntent } from '../net/hubConnection';
import { readMoveAxes } from '../net/input';
import { useHubStore } from '../store/hub';
import { RECONCILE_RATE, RECONCILE_THRESHOLD, localPlayer, seedLocalPlayer } from './localPlayer';

/**
 * Third-person camera and client-side prediction.
 *
 * The loop each frame is: read input, integrate it locally with exactly the
 * same speed, clamp and collision code the server runs, draw that immediately,
 * and send the *intent* upstream at the server tick rate. The prediction is
 * what makes input feel instant; the server remains the only thing that
 * decides where the avatar actually is, and when the two drift apart by more
 * than a threshold the server wins.
 */
const CAMERA_MIN_DISTANCE = 2.5;
const CAMERA_MAX_DISTANCE = 14;
const CAMERA_MIN_PITCH = 0.15;
const CAMERA_MAX_PITCH = 1.35;
const LOOK_SENSITIVITY = 0.005;

export default function PlayerController() {
  const { camera, gl } = useThree();
  const mySessionId = useHubStore((state) => state.mySessionId);

  const yaw = useRef(Math.PI);
  const pitch = useRef(0.38);
  const distance = useRef(9);
  const sinceLastIntent = useRef(0);
  const target = useRef(new Vector3());
  const desired = useRef(new Vector3());

  /* --- Pointer look. Bound to the canvas so UI panels keep their clicks. --- */
  useEffect(() => {
    const canvas = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let pointerId: number | null = null;

    const onPointerDown = (event: PointerEvent) => {
      // Ignore the touch that belongs to the on-screen joystick.
      if ((event.target as HTMLElement)?.dataset?.joystick === 'true') return;
      dragging = true;
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== pointerId) return;
      yaw.current -= (event.clientX - lastX) * LOOK_SENSITIVITY;
      pitch.current = Math.min(
        CAMERA_MAX_PITCH,
        Math.max(CAMERA_MIN_PITCH, pitch.current + (event.clientY - lastY) * LOOK_SENSITIVITY),
      );
      lastX = event.clientX;
      lastY = event.clientY;
    };

    const endDrag = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      dragging = false;
      pointerId = null;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      distance.current = Math.min(
        CAMERA_MAX_DISTANCE,
        Math.max(CAMERA_MIN_DISTANCE, distance.current + Math.sign(event.deltaY) * 0.6),
      );
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [gl]);

  useFrame((_state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const room = getRoom();
    const authoritative = mySessionId ? room?.state.players.get(mySessionId) : undefined;

    if (!localPlayer.initialised) {
      if (!authoritative) return;
      seedLocalPlayer(authoritative.x, authoritative.z, authoritative.rotY);
      yaw.current = authoritative.rotY + Math.PI;
    }

    const axes = readMoveAxes();

    // Movement is relative to where the camera is looking, which is what every
    // third-person control scheme has taught players to expect.
    const sin = Math.sin(yaw.current);
    const cos = Math.cos(yaw.current);
    let dirX = axes.right * cos - axes.forward * sin;
    let dirZ = -axes.right * sin - axes.forward * cos;

    const magnitude = Math.hypot(dirX, dirZ);
    const moving = magnitude > 0.01;

    if (moving) {
      dirX /= magnitude;
      dirZ /= magnitude;

      const speed = axes.run ? AVATAR_RUN_SPEED : AVATAR_WALK_SPEED;
      const resolved = resolvePosition(
        localPlayer.x + dirX * speed * dt,
        localPlayer.z + dirZ * speed * dt,
      );
      localPlayer.x = resolved.x;
      localPlayer.z = resolved.z;
      localPlayer.rotY = Math.atan2(dirX, dirZ);
    }

    localPlayer.moving = moving;
    localPlayer.running = moving && axes.run;

    // Reconciliation. Small disagreements are latency and are ignored; a large
    // one means the prediction was wrong - a collision the client resolved
    // differently, or a teleport - and the server's position is pulled in.
    if (authoritative) {
      const drift = Math.hypot(authoritative.x - localPlayer.x, authoritative.z - localPlayer.z);
      if (drift > RECONCILE_THRESHOLD) {
        const blend = 1 - Math.exp(-RECONCILE_RATE * dt);
        localPlayer.x += (authoritative.x - localPlayer.x) * blend;
        localPlayer.z += (authoritative.z - localPlayer.z) * blend;
      }
    }

    // Send at the server's tick rate. Sending faster would be discarded: the
    // room applies at most one intent per tick.
    sinceLastIntent.current += dt * 1000;
    if (sinceLastIntent.current >= HUB_TICK_MS) {
      sinceLastIntent.current = 0;
      localPlayer.seq += 1;
      sendMoveIntent(
        localPlayer.seq,
        moving ? dirX : 0,
        moving ? dirZ : 0,
        localPlayer.running,
        localPlayer.rotY,
      );
    }

    /* --- Camera --- */
    target.current.set(localPlayer.x, AVATAR_EYE_HEIGHT, localPlayer.z);

    const horizontal = Math.cos(pitch.current) * distance.current;
    desired.current.set(
      target.current.x + Math.sin(yaw.current) * horizontal,
      target.current.y + Math.sin(pitch.current) * distance.current,
      target.current.z + Math.cos(yaw.current) * horizontal,
    );

    // Keep the camera above the ground even when the player drags it low.
    desired.current.y = Math.max(desired.current.y, 0.8);

    camera.position.lerp(desired.current, 1 - Math.exp(-12 * dt));
    camera.lookAt(target.current);
  });

  return null;
}
