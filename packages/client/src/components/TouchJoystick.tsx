import { useEffect, useRef } from 'react';
import { joystick } from '../net/input';

/**
 * On-screen movement stick for touch devices.
 *
 * Writes straight into the shared input object rather than into React state:
 * the value is read once per frame by the controller, and a 60 Hz setState
 * here would re-render the whole HUD for a number nothing in the tree renders.
 *
 * The `data-joystick` attribute is how the camera's pointer handler knows to
 * ignore this touch, so dragging the stick does not also swing the camera.
 */
const RADIUS = 52;

export default function TouchJoystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const base = baseRef.current;
    const knob = knobRef.current;
    if (!base || !knob) return;

    let pointerId: number | null = null;
    let originX = 0;
    let originY = 0;

    const update = (dx: number, dy: number) => {
      const distance = Math.hypot(dx, dy);
      const clamped = distance > RADIUS ? RADIUS / distance : 1;
      const x = dx * clamped;
      const y = dy * clamped;

      knob.style.transform = `translate(${x}px, ${y}px)`;
      joystick.x = x / RADIUS;
      joystick.y = y / RADIUS;
      joystick.active = true;
    };

    const release = () => {
      pointerId = null;
      knob.style.transform = 'translate(0px, 0px)';
      joystick.x = 0;
      joystick.y = 0;
      joystick.active = false;
    };

    const onDown = (event: PointerEvent) => {
      event.preventDefault();
      pointerId = event.pointerId;
      const rect = base.getBoundingClientRect();
      originX = rect.left + rect.width / 2;
      originY = rect.top + rect.height / 2;
      base.setPointerCapture(event.pointerId);
      update(event.clientX - originX, event.clientY - originY);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      event.preventDefault();
      update(event.clientX - originX, event.clientY - originY);
    };

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      if (base.hasPointerCapture(event.pointerId)) base.releasePointerCapture(event.pointerId);
      release();
    };

    base.addEventListener('pointerdown', onDown);
    base.addEventListener('pointermove', onMove);
    base.addEventListener('pointerup', onUp);
    base.addEventListener('pointercancel', onUp);

    return () => {
      base.removeEventListener('pointerdown', onDown);
      base.removeEventListener('pointermove', onMove);
      base.removeEventListener('pointerup', onUp);
      base.removeEventListener('pointercancel', onUp);
      release();
    };
  }, []);

  return (
    <div
      ref={baseRef}
      data-joystick="true"
      aria-hidden="true"
      className="pointer-events-auto relative grid h-32 w-32 touch-none place-items-center rounded-full border border-surface-500 bg-surface-800/60 backdrop-blur"
    >
      <div
        ref={knobRef}
        data-joystick="true"
        className="h-14 w-14 rounded-full border border-brand-400 bg-brand-600/70"
      />
    </div>
  );
}
