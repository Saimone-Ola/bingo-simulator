import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SLOT_RTP_MAX,
  SLOT_RTP_MIN,
  convergenceRun,
  runInstantChecks,
  type ConvergenceSample,
} from '../lib/thesisChecks';

/**
 * Live verification panel for the presentation mode.
 *
 * Everything on screen is computed when it is shown, by calling the same shared
 * code the server runs. Nothing here is a stored result — which is the point,
 * because a stored result proves only that something once worked.
 */

const TOTAL_SPINS = 200_000;
const BATCH = 5_000;

export default function ThesisChecks() {
  const checks = useMemo(() => runInstantChecks(), []);
  const [samples, setSamples] = useState<ConvergenceSample[]>([]);
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  /**
   * Steps the Monte Carlo one batch per animation frame.
   *
   * A 200 000 spin run in a single call would freeze the tab for seconds in
   * front of an audience; yielding between batches keeps the figure visibly
   * settling, which is the thing worth watching anyway.
   */
  const simulate = () => {
    if (running) return;
    cancelled.current = false;
    setSamples([]);
    setRunning(true);

    const run = convergenceRun('medium', TOTAL_SPINS, BATCH);
    const pump = () => {
      if (cancelled.current) return;
      const next = run.next();
      if (next.done) {
        setRunning(false);
        return;
      }
      setSamples((previous) => [...previous, next.value]);
      requestAnimationFrame(pump);
    };
    requestAnimationFrame(pump);
  };

  const latest = samples.at(-1);

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        {checks.map((check) => (
          <article
            key={check.id}
            className={`rounded-2xl border p-3.5 ${
              check.passed
                ? 'border-emerald-300/25 bg-emerald-400/8'
                : 'border-rose-400/40 bg-rose-500/10'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                  check.passed ? 'bg-emerald-400 text-[#0b2018]' : 'bg-rose-400 text-[#2a0b12]'
                }`}
              >
                {check.passed ? '✓' : '✕'}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-black text-white/90">{check.title}</h3>
                <p className="mt-1 text-[12px] leading-5 text-white/60">{check.evidence}</p>
                <p className="mt-1.5 text-[11px] leading-4 text-white/35">{check.claim}</p>
                <p className="mt-1 truncate font-mono text-[10px] text-white/25">{check.source}</p>
              </div>
            </div>
            <span className="sr-only">{check.passed ? 'verificato' : 'fallito'}</span>
          </article>
        ))}
      </div>

      {/* Monte Carlo, run here and now. */}
      <article className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-white/90">
              RTP misurato per simulazione
            </h3>
            <p className="text-[11px] text-white/40">
              {TOTAL_SPINS.toLocaleString('it-IT')} giri, eseguiti in questa pagina
            </p>
          </div>
          <button
            type="button"
            onClick={simulate}
            disabled={running}
            className="rounded-xl bg-white px-3.5 py-2 text-xs font-black text-[#171229] transition hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
          >
            {running ? 'In corso…' : 'Esegui ora'}
          </button>
        </div>

        {latest ? (
          <div className="mt-3 grid gap-2">
            <div className="flex items-baseline gap-3">
              <span className="font-display text-3xl font-black tabular text-amber-300">
                {(latest.measured * 100).toFixed(2)}%
              </span>
              <span className="text-[11px] text-white/45">
                su {latest.spins.toLocaleString('it-IT')} giri · gioco base{' '}
                {(latest.analytic * 100).toFixed(2)}%
              </span>
            </div>
            <Sparkline samples={samples} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/40">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-0.5 w-4 rounded bg-amber-300" /> misurato
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-0.5 w-4 rounded border-t border-dashed border-white/50"
                />{' '}
                gioco base (calcolato)
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2.5 w-4 rounded bg-emerald-400/25" /> finestra
                di pubblicazione
              </span>
            </div>
            <p className="text-[11px] leading-4 text-white/45">
              La cifra parte instabile e si assesta. È misurata, non calcolata: contiene
              scatter e giri gratuiti, che la formula chiusa non vede. Per questo la
              pubblicazione è vincolata alla simulazione e non alla formula, con finestra{' '}
              {(SLOT_RTP_MIN * 100).toFixed(0)}–{(SLOT_RTP_MAX * 100).toFixed(0)}%.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-white/40">
            Nessuna misura in memoria: viene calcolata al momento, così quello che si vede
            non può essere un risultato salvato.
          </p>
        )}
      </article>
    </div>
  );
}

/** Measured RTP over the run, against the window and the analytic floor. */
function Sparkline({ samples }: { samples: readonly ConvergenceSample[] }) {
  if (samples.length < 2) return null;

  // Scaled to the data, not to a fixed window: the story is the early swing
  // settling down, and a range wide enough to contain every possible RTP would
  // flatten exactly that into a straight line.
  const values = samples.map((sample) => sample.measured).concat(samples[0]!.analytic);
  const span = Math.max(0.04, Math.max(...values) - Math.min(...values));
  const pad = span * 0.15;
  const lo = Math.min(...values) - pad;
  const hi = Math.max(...values) + pad;
  const y = (value: number) =>
    Math.min(100, Math.max(0, 100 - ((value - lo) / (hi - lo)) * 100));
  const points = samples
    .map((sample, index) => `${(index / (samples.length - 1)) * 100},${y(sample.measured)}`)
    .join(' ');

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-24 w-full rounded-lg bg-black/30"
      role="img"
      aria-label={`RTP misurato: ${(samples.at(-1)!.measured * 100).toFixed(2)}%`}
    >
      <rect
        x="0"
        y={y(SLOT_RTP_MAX)}
        width="100"
        height={y(SLOT_RTP_MIN) - y(SLOT_RTP_MAX)}
        className="fill-emerald-400/15"
      />
      <line
        x1="0"
        x2="100"
        y1={y(samples[0]!.analytic)}
        y2={y(samples[0]!.analytic)}
        className="stroke-white/25"
        strokeWidth="0.5"
        strokeDasharray="2 2"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={points}
        fill="none"
        className="stroke-amber-300"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
