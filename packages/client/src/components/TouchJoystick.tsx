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
export default function TouchJoystick({ compact = false }: { compact?: boolean }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const base = baseRef.current;
    const knob = knobRef.current;
    if (!base || !knob) return;

    let pointerId: number | null = null;
    let originX = 0;
    let originY = 0;
    let radius = 32;

    const update = (dx: number, dy: number) => {
      const distance = Math.hypot(dx, dy);
      const clamped = distance > radius ? radius / distance : 1;
      const x = dx * clamped;
      const y = dy * clamped;

      knob.style.transform = `translate(${x}px, ${y}px)`;
      joystick.x = x / radius;
      joystick.y = y / radius;
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
      radius = Math.max(1, (rect.width - knob.getBoundingClientRect().width) / 2 - 4);
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
      className={`pointer-events-auto relative grid touch-none place-items-center rounded-full border border-surface-500 bg-surface-800/60 ${compact ? 'h-24 w-24' : 'h-32 w-32'}`}
    >
      <div
        ref={knobRef}
        data-joystick="true"
        className={`rounded-full border border-brand-400 bg-brand-600/70 ${compact ? 'h-10 w-10' : 'h-14 w-14'}`}
      />
    </div>
  );
}
