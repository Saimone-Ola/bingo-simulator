import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { attachKeyboard, readMoveAxes } from '../../net/input';
import {
  HALL_COLLIDERS,
  SEATED_EYE_HEIGHT,
  STANDING_EYE_HEIGHT,
  SPAWN,
  distanceTo,
  isNearReception,
  standingSpotForSeat,
  type SeatPlacement,
} from './hallLayout';
import {
  createMovementState,
  damp,
  dampAngle,
  stepMovement,
  type PlayerStance,
} from './movement';

/**
 * First person controller for the hall.
 *
 * Standing: WASD walks, the mouse looks (pointer lock, or drag when unlocked),
 * shift is a brisk walk rather than a sprint, E interacts.
 * Seated: the body is pinned to the chair and only the head turns, with enough
 * range to look from the cards to the stage and around the table.
 *
 * The camera is written directly every frame; React never sees the position.
 */

export type InteractionTarget = 'RECEPTION' | 'SIT' | 'STAND' | null;

const LOOK_SENSITIVITY = 0.0022;
const SEATED_YAW_RANGE = 1.5;
const PITCH_MIN = -1.15;
const PITCH_MAX = 0.72;

export interface PlayerMovementControllerProps {
  seat: SeatPlacement | null;
  stance: PlayerStance;
  eyeHeightScale: number;
  reducedMotion: boolean;
  headBob: boolean;
  /** Gently swings the view towards the stage, used during the countdown. */
  focusStage: boolean;
  /** Blocks input while a modal panel owns the keyboard. */
  inputEnabled: boolean;
  onInteract: (target: InteractionTarget) => void;
  onTargetChange: (target: InteractionTarget) => void;
  onFootstep: () => void;
  onRequestExitPointerLock: () => void;
}

export function PlayerMovementController({
  seat,
  stance,
  eyeHeightScale,
  reducedMotion,
  headBob,
  focusStage,
  inputEnabled,
  onInteract,
  onTargetChange,
  onFootstep,
  onRequestExitPointerLock,
}: PlayerMovementControllerProps) {
  const { camera, gl } = useThree();
  const movement = useMemo(() => createMovementState(SPAWN.x, SPAWN.z), []);
  const yaw = useRef<number>(SPAWN.yaw);
  const pitch = useRef<number>(-0.06);
  const yawTarget = useRef<number>(SPAWN.yaw);
  const pitchTarget = useRef<number>(-0.06);
  const bobPhase = useRef(0);
  const lastFootstep = useRef(0);
  const target = useRef<InteractionTarget>(null);
  const seatRef = useRef<SeatPlacement | null>(seat);
  const stanceRef = useRef<PlayerStance>(stance);
  const enabledRef = useRef(inputEnabled);
  const interactRef = useRef(onInteract);
  const targetChangeRef = useRef(onTargetChange);
  const footstepRef = useRef(onFootstep);
  const exitLockRef = useRef(onRequestExitPointerLock);

  seatRef.current = seat;
  stanceRef.current = stance;
  enabledRef.current = inputEnabled;
  interactRef.current = onInteract;
  targetChangeRef.current = onTargetChange;
  footstepRef.current = onFootstep;
  exitLockRef.current = onRequestExitPointerLock;

  // Seat changes teleport the body: the server decides where a player sits, and
  // walking them there would desynchronise the view from the snapshot.
  useEffect(() => {
    if (stance !== 'SEATED' || !seat) return;
    movement.x = seat.x;
    movement.z = seat.z;
    movement.velocityX = 0;
    movement.velocityZ = 0;
    yawTarget.current = seat.facing + Math.PI;
    yaw.current = seat.facing + Math.PI;
    pitchTarget.current = -0.42;
  }, [movement, seat, stance]);

  useEffect(() => {
    if (stance !== 'STANDING' || !seat) return;
    // Standing up steps back from the table instead of clipping through it.
    const spot = standingSpotForSeat(seat);
    movement.x = spot.x;
    movement.z = spot.z;
    movement.velocityX = 0;
    movement.velocityZ = 0;
    pitchTarget.current = -0.06;
  }, [movement, seat, stance]);

  useEffect(() => attachKeyboard(), []);

  useEffect(() => {
    camera.rotation.order = 'YXZ';
  }, [camera]);

  useEffect(() => {
    const canvas = gl.domElement;
    const previousTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const applyLook = (deltaX: number, deltaY: number) => {
      if (!enabledRef.current) return;
      yawTarget.current -= deltaX * LOOK_SENSITIVITY;
      pitchTarget.current = THREE.MathUtils.clamp(
        pitchTarget.current - deltaY * LOOK_SENSITIVITY,
        PITCH_MIN,
        PITCH_MAX,
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      const element = event.target as HTMLElement | null;
      if (element?.dataset.joystick === 'true') return;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (document.pointerLockElement === canvas) {
        applyLook(event.movementX, event.movementY);
        return;
      }
      if (!dragging) return;
      applyLook(event.clientX - lastX, event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const stopDragging = () => {
      dragging = false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      if (element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) return;
      if (event.code === 'KeyE') {
        event.preventDefault();
        if (enabledRef.current) interactRef.current(target.current);
      }
      if (event.code === 'Escape') {
        exitLockRef.current();
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      window.removeEventListener('keydown', onKeyDown);
      canvas.style.touchAction = previousTouchAction;
    };
  }, [gl]);

  useFrame((_state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const seated = stanceRef.current === 'SEATED';
    const currentSeat = seatRef.current;
    const axes = enabledRef.current ? readMoveAxes() : { forward: 0, right: 0, run: false };

    // Right stick of a gamepad drives the camera; the left stick drives walking.
    const pads = typeof navigator !== 'undefined' ? navigator.getGamepads?.() : null;
    const pad = pads?.[0] ?? null;
    let padForward = 0;
    let padRight = 0;
    if (pad && enabledRef.current) {
      const deadzone = (value: number) => (Math.abs(value) > 0.16 ? value : 0);
      padRight = deadzone(pad.axes[0] ?? 0);
      padForward = -deadzone(pad.axes[1] ?? 0);
      yawTarget.current -= deadzone(pad.axes[2] ?? 0) * 2.4 * delta;
      pitchTarget.current = THREE.MathUtils.clamp(
        pitchTarget.current - deadzone(pad.axes[3] ?? 0) * 1.8 * delta,
        PITCH_MIN,
        PITCH_MAX,
      );
    }

    if (focusStage) {
      // The countdown turns everyone towards the stage without seizing control:
      // any look input immediately wins over this nudge.
      yawTarget.current = dampAngle(yawTarget.current, Math.PI, 1.4, delta);
      pitchTarget.current = damp(pitchTarget.current, -0.02, 1.4, delta);
    }

    if (seated && currentSeat) {
      const centre = currentSeat.facing + Math.PI;
      yawTarget.current = centre + THREE.MathUtils.clamp(
        ((yawTarget.current - centre + Math.PI * 3) % (Math.PI * 2)) - Math.PI,
        -SEATED_YAW_RANGE,
        SEATED_YAW_RANGE,
      );
      movement.velocityX = 0;
      movement.velocityZ = 0;
    } else {
      stepMovement(
        movement,
        {
          forward: axes.forward + padForward,
          strafe: axes.right + padRight,
          yaw: yaw.current,
          sprint: axes.run || Boolean(pad?.buttons[10]?.pressed),
        },
        delta,
        HALL_COLLIDERS,
      );
    }

    const lambda = reducedMotion ? 40 : 16;
    yaw.current = dampAngle(yaw.current, yawTarget.current, lambda, delta);
    pitch.current = damp(pitch.current, pitchTarget.current, lambda, delta);

    const speed = Math.hypot(movement.velocityX, movement.velocityZ);
    let bob = 0;
    if (!seated && headBob && !reducedMotion && speed > 0.2) {
      bobPhase.current += delta * speed * 3.4;
      bob = Math.sin(bobPhase.current * 2) * 0.022;
      if (movement.travelled - lastFootstep.current > 0.78) {
        lastFootstep.current = movement.travelled;
        footstepRef.current();
      }
    } else {
      bobPhase.current = 0;
      lastFootstep.current = movement.travelled;
    }

    const eyeHeight = (seated ? SEATED_EYE_HEIGHT : STANDING_EYE_HEIGHT) * eyeHeightScale;
    camera.position.x = movement.x;
    camera.position.z = movement.z;
    camera.position.y = damp(camera.position.y, eyeHeight + bob, reducedMotion ? 30 : 14, delta);
    camera.rotation.set(pitch.current, yaw.current, 0);

    // Interaction prompt, recomputed every frame but only published on change so
    // the HUD re-renders a handful of times per minute instead of per frame.
    let next: InteractionTarget = null;
    if (seated) next = 'STAND';
    else if (isNearReception(movement.x, movement.z)) next = 'RECEPTION';
    else if (currentSeat && distanceTo(movement.x, movement.z, currentSeat.x, currentSeat.z) < 1.5) {
      next = 'SIT';
    }
    if (next !== target.current) {
      target.current = next;
      targetChangeRef.current(next);
    }
  });

  return null;
}

export default PlayerMovementController;
