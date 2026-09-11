import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { attachKeyboard, readMoveAxes } from '../../net/input';
import {
  HALL_COLLIDERS,
  SEATED_EYE_HEIGHT,
  STANDING_EYE_HEIGHT,
  SPAWN,
  isNearReception,
  nearestSeat,
  standingSpotForSeat,
  type SeatPlacement,
} from './hallLayout';
import { SEAT_INTERACT_RADIUS } from '@bingo/shared';
import { layoutCards } from './cardLayout';
import { CARD_VIEW_FOV, HALL_VIEW_FOV, cardViewForSeat, createViewReturnLatch } from './cameraView';
import {
  createMovementState,
  createPoseLatch,
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

/**
 * What the player is pointed at, with the detail needed to act on it.
 *
 * 'SIT' carries the chair: sitting down is a request to the server for one
 * specific seat, and "the seat I am standing next to" is knowledge only the
 * controller has.
 */
export interface InteractionFocus {
  target: InteractionTarget;
  seatId: string | null;
}

const LOOK_SENSITIVITY = 0.0022;
const SEATED_YAW_RANGE = 1.5;
const PITCH_MIN = -1.15;
const PITCH_MAX = 0.72;

export interface PlayerMovementControllerProps {
  seat: SeatPlacement | null;
  stance: PlayerStance;
  /**
   * Chairs nobody is in. Sitting down means walking up to one and pressing E,
   * so the controller needs to know which ones are actually available — before
   * this it could only offer the seat the player already had, which meant the
   * only way to get a first seat was the overlay map.
   */
  freeSeats: readonly SeatPlacement[];
  eyeHeightScale: number;
  reducedMotion: boolean;
  headBob: boolean;
  /** An explicit player action; events never take control of the view. */
  focusCard: boolean;
  cardCount: number;
  selectedCard: number;
  /** Blocks input while a modal panel owns the keyboard. */
  inputEnabled: boolean;
  onInteract: (focus: InteractionFocus) => void;
  onTargetChange: (focus: InteractionFocus) => void;
  onFootstep: () => void;
  onRequestExitPointerLock: () => void;
}

export function PlayerMovementController({
  seat,
  stance,
  freeSeats,
  eyeHeightScale,
  reducedMotion,
  headBob,
  focusCard,
  cardCount,
  selectedCard,
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
  const focus = useRef<InteractionFocus>({ target: null, seatId: null });
  const freeSeatsRef = useRef<readonly SeatPlacement[]>(freeSeats);
  const seatRef = useRef<SeatPlacement | null>(seat);
  const stanceRef = useRef<PlayerStance>(stance);
  const enabledRef = useRef(inputEnabled);
  const interactRef = useRef(onInteract);
  const targetChangeRef = useRef(onTargetChange);
  const footstepRef = useRef(onFootstep);
  const exitLockRef = useRef(onRequestExitPointerLock);
  const viewReturn = useMemo(() => createViewReturnLatch(), []);
  const inspectingCard = focusCard && stance === 'SEATED' && cardCount > 0;
  const inspectingRef = useRef(inspectingCard);
  inspectingRef.current = inspectingCard;

  seatRef.current = seat;
  stanceRef.current = stance;
  freeSeatsRef.current = freeSeats;
  enabledRef.current = inputEnabled;
  interactRef.current = onInteract;
  targetChangeRef.current = onTargetChange;
  footstepRef.current = onFootstep;
  exitLockRef.current = onRequestExitPointerLock;

  /**
   * Sitting down and standing up move the body. Each happens once.
   *
   * This has to fire on the *transition*, not whenever the effect's inputs
   * change identity. The seat object is rebuilt from the room snapshot on every
   * server patch, so an effect keyed on it re-ran several times a second — and
   * since it re-ran while the player was standing, it dragged them back to the
   * spot beside their chair on every patch. You could press the key, watch
   * yourself stand, and never get further than the chair you had just left.
   * Seated it was just as bad: the yaw was reset to face the table each patch,
   * so you could not look around either.
   *
   * Keyed on the seat's *id* and the stance, which only change when the player
   * actually sits down, stands up or moves chair.
   */
  const poseLatch = useMemo(() => createPoseLatch(), []);
  useEffect(() => {
    if (!poseLatch.shouldApply(seat?.id ?? null, stance)) return;
    if (!seat) return;

    if (stance === 'SEATED') {
      movement.x = seat.x;
      movement.z = seat.z;
      yawTarget.current = seat.facing + Math.PI;
      yaw.current = seat.facing + Math.PI;
      pitchTarget.current = -0.42;
    } else {
      // Standing up steps back from the table instead of clipping through it.
      const spot = standingSpotForSeat(seat);
      movement.x = spot.x;
      movement.z = spot.z;
      pitchTarget.current = -0.06;
    }
    movement.velocityX = 0;
    movement.velocityZ = 0;
  }, [movement, poseLatch, seat, stance]);

  const seatId = seat?.id ?? null;
  useEffect(() => {
    viewReturn.clear();
  }, [seatId, stance, viewReturn]);

  useEffect(() => {
    if (inspectingCard && seatRef.current) {
      viewReturn.enter(yawTarget.current, pitchTarget.current);
      const view = cardViewForSeat(seatRef.current, SEATED_EYE_HEIGHT * eyeHeightScale, layoutCards(cardCount)[selectedCard]);
      yawTarget.current = view.yaw;
      pitchTarget.current = view.pitch;
      if (document.pointerLockElement === gl.domElement) void document.exitPointerLock();
    } else {
      const view = viewReturn.leave();
      if (view) { yawTarget.current = view.yaw; pitchTarget.current = view.pitch; }
    }
  }, [inspectingCard, seatId, selectedCard, cardCount, eyeHeightScale, viewReturn, gl]);

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
      if (!enabledRef.current || inspectingRef.current) return;
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
        if (enabledRef.current) interactRef.current(focus.current);
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
    if (pad && enabledRef.current && !inspectingRef.current) {
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
    if (camera instanceof THREE.PerspectiveCamera) {
      const targetFov = inspectingRef.current ? CARD_VIEW_FOV : HALL_VIEW_FOV;
      const fov = damp(camera.fov, targetFov, reducedMotion ? 40 : 10, delta);
      if (Math.abs(camera.fov - fov) > 0.001) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }

    // Interaction prompt, recomputed every frame but only published on change so
    // the HUD re-renders a handful of times per minute instead of per frame.
    let next: InteractionTarget = null;
    let nextSeatId: string | null = null;
    if (seated) {
      next = 'STAND';
      nextSeatId = currentSeat?.id ?? null;
    } else if (isNearReception(movement.x, movement.z)) {
      next = 'RECEPTION';
    } else {
      // Any free chair within reach, not only one the server already gave us.
      const reachable = nearestSeat(
        movement.x,
        movement.z,
        freeSeatsRef.current,
        SEAT_INTERACT_RADIUS,
      );
      if (reachable) {
        next = 'SIT';
        nextSeatId = reachable.id;
      }
    }
    if (next !== focus.current.target || nextSeatId !== focus.current.seatId) {
      focus.current = { target: next, seatId: nextSeatId };
      targetChangeRef.current(focus.current);
    }
  });

  return null;
}

export default PlayerMovementController;
