import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

/** Opt-in development diagnostics. Never changes the render loop or game state. */
export default function DevRenderProbe({ quality }: { quality: string }) {
  const { gl } = useThree();
  const output = useRef<HTMLOutputElement | null>(null);
  const samples = useRef<{ ms: number; calls: number; triangles: number }[]>([]);
  const elapsed = useRef(0);
  const warmup = useRef(0);
  const skipNextFrame = useRef(true);

  useEffect(() => {
    const panel = document.createElement('output');
    panel.dataset.bingoPerformance = 'true';
    panel.setAttribute('aria-label', 'Prestazioni rendering sviluppo');
    panel.style.cssText = 'position:absolute;right:12px;bottom:76px;z-index:30;pointer-events:none;white-space:pre;font:11px/1.5 monospace;padding:8px 10px;border:1px solid var(--color-brand-300);border-radius:8px;color:var(--color-content-primary);background:var(--color-surface-900)';
    panel.textContent = 'DEV · rendering\nRiscaldamento…';
    gl.domElement.parentElement?.appendChild(panel);
    output.current = panel;
    const resetVisibility = () => {
      samples.current = [];
      elapsed.current = 0;
      skipNextFrame.current = true;
    };
    document.addEventListener('visibilitychange', resetVisibility);
    return () => {
      document.removeEventListener('visibilitychange', resetVisibility);
      panel.remove();
      output.current = null;
    };
  }, [gl]);

  // Negative priority observes the previous rendered frame and does not take
  // ownership of R3F's loop. DOM text changes once per second, without setState.
  useFrame((_state, delta) => {
    if (document.visibilityState !== 'visible' || delta <= 0) {
      samples.current = [];
      elapsed.current = 0;
      return;
    }
    if (skipNextFrame.current) { skipNextFrame.current = false; return; }
    warmup.current += delta;
    if (warmup.current < 2) return;
    elapsed.current += delta;
    samples.current.push({ ms: delta * 1000, calls: gl.info.render.calls, triangles: gl.info.render.triangles });
    if (elapsed.current < 1 || !output.current) return;
    const rows = samples.current;
    const mean = (key: 'ms' | 'calls' | 'triangles') => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
    const frames = rows.map((row) => row.ms).sort((a, b) => a - b);
    const p95 = frames[Math.min(frames.length - 1, Math.ceil(frames.length * 0.95) - 1)]!;
    const ms = mean('ms');
    output.current.textContent = [
      `DEV · ${quality} · ${gl.domElement.width}×${gl.domElement.height} · DPR ${gl.getPixelRatio().toFixed(2)}`,
      `${(1000 / ms).toFixed(1)} FPS · intervallo frame ${ms.toFixed(1)} ms · P95 ${p95.toFixed(1)} ms`,
      `${Math.round(mean('calls'))} draw call · ${Math.round(mean('triangles')).toLocaleString('it-IT')} triangoli`,
      `${gl.info.memory.geometries} geometrie · ${gl.info.memory.textures} texture · ${rows.length} campioni`,
    ].join('\n');
    samples.current = [];
    elapsed.current = 0;
  }, -1000);

  return null;
}
