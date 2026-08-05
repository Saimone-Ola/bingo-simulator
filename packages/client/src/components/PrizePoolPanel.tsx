import { useEffect, useRef, useState } from 'react';
import {
  BINGO_PRIZE_TIERS,
  BINGO_PRIZE_TIER_LABELS,
  potentialWin,
  type PrizeBreakdown,
} from '@bingo/shared';

/**
 * The prize pool, during card sales.
 *
 * Every figure here comes from the server's breakdown; nothing is recomputed
 * locally, so the panel cannot disagree with what will actually be paid. The
 * one thing this component adds is *change over time*: it remembers the last
 * pot it saw and flags the difference, because a number that silently becomes a
 * bigger number is not the same as watching it go up.
 */

export interface PrizePoolPanelProps {
  pool: PrizeBreakdown;
  /** How many cards this player holds, for "what you would win". */
  myCards: number;
  className?: string;
}

function useRise(value: number): number {
  const previous = useRef(value);
  const [delta, setDelta] = useState(0);

  useEffect(() => {
    if (value > previous.current) {
      setDelta(value - previous.current);
      const timer = window.setTimeout(() => setDelta(0), 2_200);
      previous.current = value;
      return () => window.clearTimeout(timer);
    }
    previous.current = value;
    return undefined;
  }, [value]);

  return delta;
}

export default function PrizePoolPanel({ pool, myCards, className = '' }: PrizePoolPanelProps) {
  const rise = useRise(pool.distributedCredits);

  // How full the pot is against a round that sold three times as much. Not a
  // target, just a sense of scale — a bar with no reference point is decoration.
  const reference = Math.max(1, pool.cardsSold * 3, 30);
  const fill = Math.min(100, (pool.cardsSold / reference) * 100);

  return (
    <section
      className={`rounded-2xl border border-surface-500/70 bg-surface-900/90 p-4 shadow-panel backdrop-blur-xl ${className}`}
      aria-label="Montepremi"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-2xs font-black uppercase tracking-[0.18em] text-content-muted">
          Montepremi
        </h2>
        <p className="text-2xs text-content-muted">
          {pool.cardsSold} {pool.cardsSold === 1 ? 'cartella venduta' : 'cartelle vendute'}
        </p>
      </div>

      <div className="mt-1 flex items-baseline gap-2">
        <p className="font-display text-4xl font-black tabular text-accent-300" aria-live="polite">
          {pool.distributedCredits}
        </p>
        <span className="text-xs text-content-muted">crediti</span>
        {rise > 0 && (
          <span className="rounded-md bg-success-500/20 px-1.5 py-0.5 text-2xs font-black tabular text-success-400">
            +{rise}
          </span>
        )}
      </div>

      {/* How the pot grows as more players arrive. */}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-700" aria-hidden="true">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-400 transition-[width] duration-500"
          style={{ width: `${fill}%` }}
        />
      </div>
      <p className="mt-1 text-2xs text-content-muted">Sale a ogni cartella venduta in sala.</p>

      <dl className="mt-3 grid gap-1 border-t border-surface-600/70 pt-2">
        {BINGO_PRIZE_TIERS.map((tier) => (
          <div key={tier} className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-content-secondary">{BINGO_PRIZE_TIER_LABELS[tier]}</dt>
            <dd className="tabular font-semibold text-content-primary">{pool.perTier[tier]}</dd>
          </div>
        ))}
      </dl>

      {pool.jackpotCredits > 0 && (
        <p className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-accent-400/40 bg-accent-500/10 px-2.5 py-1.5 text-sm">
          <span className="font-black uppercase tracking-wider text-accent-300">Jackpot</span>
          <span className="tabular font-black text-accent-300">{pool.jackpotCredits}</span>
        </p>
      )}

      {myCards > 0 ? (
        <p className="mt-3 rounded-lg border border-brand-400/40 bg-brand-500/10 px-3 py-2 text-sm">
          Con {myCards} {myCards === 1 ? 'cartella' : 'cartelle'}, se facessi bingo adesso
          vinceresti{' '}
          <strong className="tabular text-brand-200">{potentialWin(pool, 'BINGO')}</strong> crediti.
        </p>
      ) : (
        <p className="mt-3 text-2xs text-content-muted">
          Acquista una cartella per vedere quanto vinceresti.
        </p>
      )}

      {pool.subsidisedCredits > 0 && (
        <p className="mt-2 text-2xs text-content-muted">
          Include {pool.subsidisedCredits} crediti di premio minimo garantito dalla sala.
        </p>
      )}
    </section>
  );
}
