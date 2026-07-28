/**
 * Input state, kept outside React.
 *
 * Movement is sampled every frame; routing it through component state would
 * re-render the whole tree 60 times a second for a value nothing but the
 * animation loop reads.
 */
export interface InputState {
  forward: number;
  right: number;
  run: boolean;
  /** Camera yaw/pitch deltas accumulated since the last frame consumed them. */
  lookDeltaX: number;
  lookDeltaY: number;
  zoomDelta: number;
  /** True while a text field has focus: movement keys must type, not walk. */
  typing: boolean;
}

export const input: InputState = {
  forward: 0,
  right: 0,
  run: false,
  lookDeltaX: 0,
  lookDeltaY: 0,
  zoomDelta: 0,
  typing: false,
};

/** Touch joystick output, in the range [-1, 1]. Merged with the keyboard. */
export const joystick = { x: 0, y: 0, active: false };

const pressed = new Set<string>();

function recompute(): void {
  if (input.typing) {
    input.forward = 0;
    input.right = 0;
    input.run = false;
    return;
  }

  const forward = (pressed.has('KeyW') || pressed.has('ArrowUp') ? 1 : 0) -
    (pressed.has('KeyS') || pressed.has('ArrowDown') ? 1 : 0);
  const right = (pressed.has('KeyD') || pressed.has('ArrowRight') ? 1 : 0) -
    (pressed.has('KeyA') || pressed.has('ArrowLeft') ? 1 : 0);

  input.forward = forward;
  input.right = right;
  input.run = pressed.has('ShiftLeft') || pressed.has('ShiftRight');
}

function onKeyDown(event: KeyboardEvent): void {
  // Let the browser have the key when the player is typing in the chat box.
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

  pressed.add(event.code);
  recompute();
}

function onKeyUp(event: KeyboardEvent): void {
  pressed.delete(event.code);
  recompute();
}

/** Releases everything: a lost window focus must not leave the avatar running. */
function releaseAll(): void {
  pressed.clear();
  recompute();
}

export function attachKeyboard(): () => void {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAll);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', releaseAll);
    releaseAll();
  };
}

export function setTyping(typing: boolean): void {
  input.typing = typing;
  if (typing) releaseAll();
}

/** Combined keyboard + joystick movement axes, clamped to the unit disc. */
export function readMoveAxes(): { forward: number; right: number; run: boolean } {
  const forward = joystick.active ? -joystick.y : input.forward;
  const right = joystick.active ? joystick.x : input.right;

  const magnitude = Math.hypot(forward, right);
  if (magnitude > 1) {
    return { forward: forward / magnitude, right: right / magnitude, run: input.run };
  }
  // A joystick pushed past 85% counts as running, mirroring shift on desktop.
  return { forward, right, run: input.run || (joystick.active && magnitude > 0.85) };
}
