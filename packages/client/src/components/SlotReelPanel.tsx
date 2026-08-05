import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SLOT_VOLATILITY_LABELS,
  slotTotalBet,
  type SlotConfig,
  type SlotMachineDetail,
  type SlotSpinResponse,
} from '@bingo/shared';
import { playHallSfx, resumeHallAudio } from '../audio/hallAudio';
import { Button, CreditAmount } from './ui';

/**
 * The panel you play a machine on.
 *
 * The animation is presentation only. The grid arrives already decided by the
 * server; the reels spin, stop one after another and stop *on that grid*. There
 * is no branch in here that could change what landed — which is the property
 * that matters, because a near miss looks exactly like a win right up until the
 * last reel stops.
 */

const SYMBOL_ART: Record<string, string> = {
  cherry: '🍒',
  lemon: '🍋',
  bell: '🔔',
  seven: '7️⃣',
  wild: '🃏',
  scatter: '⭐',
};

const REEL_STOP_MS = 320;
const NEAR_MISS_EXTRA_MS = 620;
const SPIN_MIN_MS = 520;

function artFor(symbolId: string): string {
  return SYMBOL_ART[symbolId] ?? symbolId.slice(0, 2).toUpperCase();
}

/** Symbols shown while a reel is still turning. */
function blurStrip(config: SlotConfig, reel: number, tick: number): string[] {
  const ids = config.symbols.map((symbol) => symbol.id);
  return Array.from({ length: config.rows }, (_value, row) => {
    const index = (tick + reel * 3 + row * 5) % ids.length;
    return ids[index] ?? '';
  });
}

export interface SlotReelPanelProps {
  machine: SlotMachineDetail;
  balance: number;
  betPerLine: number;
  onBetPerLine: (value: number) => void;
  onSpin: () => Promise<SlotSpinResponse | null>;
  onClose: () => void;
  /** Hash of the seed the next spin will use, published before it happens. */
  commitment: string | null;
  busy: boolean;
  error: string | null;
}

export default function SlotReelPanel({
  machine,
  balance,
  betPerLine,
  onBetPerLine,
  onSpin,
  onClose,
  commitment,
  busy,
  error,
}: SlotReelPanelProps) {
  const config = machine.config;
  const totalBet = slotTotalBet(config, betPerLine);

  const [spin, setSpin] = useState<SlotSpinResponse | null>(null);
  const [stoppedReels, setStoppedReels] = useState(config.reels);
  const [tick, setTick] = useState(0);
  const [displayWin, setDisplayWin] = useState(0);
  const [highlight, setHighlight] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // Blur frames while any reel is still turning.
  useEffect(() => {
    if (stoppedReels >= config.reels) return undefined;
    const timer = window.setInterval(() => setTick((value) => value + 1), 55);
    return () => window.clearInterval(timer);
  }, [stoppedReels, config.reels]);

  // Win counter rolling up to the amount the server paid.
  useEffect(() => {
    if (!spin || stoppedReels < config.reels) return undefined;
    if (spin.winCredits === 0) {
      setDisplayWin(0);
      return undefined;
    }
    let current = 0;
    const step = Math.max(1, Math.round(spin.winCredits / 28));
    const timer = window.setInterval(() => {
      current = Math.min(spin.winCredits, current + step);
      setDisplayWin(current);
      if (current >= spin.winCredits) window.clearInterval(timer);
    }, 34);
    return () => window.clearInterval(timer);
  }, [spin, stoppedReels, config.reels]);

  // Cycle through the winning lines so each one is actually seen.
  useEffect(() => {
    if (!spin || spin.lineWins.length === 0 || stoppedReels < config.reels) {
      setHighlight(null);
      return undefined;
    }
    let index = 0;
    setHighlight(spin.lineWins[0]?.paylineIndex ?? null);
    const timer = window.setInterval(() => {
      index = (index + 1) % spin.lineWins.length;
      setHighlight(spin.lineWins[index]?.paylineIndex ?? null);
    }, 1_100);
    return () => window.clearInterval(timer);
  }, [spin, stoppedReels, config.reels]);

  const play = async () => {
    if (busy || stoppedReels < config.reels) return;
    resumeHallAudio();
    clearTimers();
    setSpin(null);
    setDisplayWin(0);
    setHighlight(null);
    setStoppedReels(0);
    playHallSfx('purchase');

    const result = await onSpin();
    if (!result) {
      setStoppedReels(config.reels);
      return;
    }

    setSpin(result);
    // Reels stop left to right. When the result was one symbol short, the last
    // reel is held a beat longer: the tension is real, because by then the
    // outcome is already fixed and cannot be changed by the delay.
    for (let reel = 0; reel < config.reels; reel += 1) {
      const last = reel === config.reels - 1;
      const delay =
        SPIN_MIN_MS + reel * REEL_STOP_MS + (last && result.nearMiss ? NEAR_MISS_EXTRA_MS : 0);
      timers.current.push(
        window.setTimeout(() => {
          setStoppedReels(reel + 1);
          playHallSfx('chair');
          if (last) {
            if (result.winCredits > 0) {
              playHallSfx(result.freeSpinsAwarded > 0 ? 'bingo' : 'cinquina');
              playHallSfx('applause');
            } else if (result.nearMiss) {
              playHallSfx('error');
            }
          }
        }, delay),
      );
    }
  };

  const highlightedCells = useMemo(() => {
    if (highlight === null) return null;
    const payline = config.paylines[highlight];
    if (!payline) return null;
    return new Set(payline.map((row, reel) => `${reel}:${row}`));
  }, [highlight, config.paylines]);

  const spinning = stoppedReels < config.reels;
  const affordable = balance >= totalBet;

  return (
    <div
      className="pointer-events-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-surface-500/70 bg-surface-900/95 shadow-panel backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label={`Slot ${machine.name}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-surface-600/70 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-black text-content-primary">
            {machine.name}
          </h2>
          <p className="text-2xs text-content-muted">
            {SLOT_VOLATILITY_LABELS[config.volatility]} · {config.paylines.length} linee ·
            RTP {(((machine.rtpSimulated ?? machine.rtpTheoretical) ?? 0) * 100).toFixed(1)}%
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Chiudi la slot">
          ✕
        </Button>
      </div>

      {/* Reels */}
      <div className="bg-surface-950/70 px-4 py-5">
        <div
          className="mx-auto grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${config.reels}, minmax(0, 1fr))`, maxWidth: '32rem' }}
        >
          {Array.from({ length: config.reels }, (_value, reel) => {
            const stopped = reel < stoppedReels;
            const column = stopped && spin ? spin.grid[reel] : blurStrip(config, reel, tick);
            return (
              <div key={reel} className="grid gap-1.5">
                {Array.from({ length: config.rows }, (_row, row) => {
                  const symbolId = column?.[row] ?? '';
                  const lit = stopped && highlightedCells?.has(`${reel}:${row}`);
                  return (
                    <div
                      key={row}
                      className={`grid aspect-square place-items-center rounded-lg border text-3xl transition-colors sm:text-4xl ${
                        lit
                          ? 'border-accent-400 bg-accent-500/25 shadow-glow-accent'
                          : 'border-surface-600 bg-surface-850'
                      } ${stopped ? '' : 'opacity-70 blur-[1px]'}`}
                    >
                      <span aria-hidden="true">{artFor(symbolId)}</span>
                      <span className="sr-only">{symbolId}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="mt-4 min-h-14 text-center" aria-live="polite">
          {spinning ? (
            <p className="font-display text-sm font-black uppercase tracking-[0.2em] text-brand-300">
              I rulli girano…
            </p>
          ) : spin && spin.winCredits > 0 ? (
            <>
              <p className="font-display text-3xl font-black text-accent-400 tabular">
                +{displayWin}
              </p>
              <p className="text-2xs text-content-muted">
                {spin.lineWins.length} linea{spin.lineWins.length === 1 ? '' : 'e'} vincente
                {spin.freeSpinsAwarded > 0 && ` · ${spin.freeSpinsAwarded} giri gratuiti (+${spin.freeSpinWin})`}
              </p>
            </>
          ) : spin && spin.nearMiss ? (
            <p className="font-display text-sm font-black uppercase tracking-[0.18em] text-warning-400">
              Per un soffio
            </p>
          ) : spin ? (
            <p className="text-sm text-content-muted">Nessuna vincita</p>
          ) : (
            <p className="text-sm text-content-muted">Premi Gira per iniziare</p>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="grid gap-3 px-4 py-4">
        {error && (
          <p role="alert" className="rounded-lg border border-danger-500/50 bg-danger-500/10 px-3 py-2 text-sm text-danger-400">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xs font-black uppercase tracking-[0.16em] text-content-muted">
              Puntata per linea
            </span>
            {[1, 2, 5, 10].map((value) => (
              <button
                key={value}
                type="button"
                disabled={spinning || busy || value > machine.maxBetCredits}
                onClick={() => onBetPerLine(value)}
                aria-pressed={betPerLine === value}
                className={`h-9 w-9 rounded-md border text-xs font-black transition ${
                  betPerLine === value
                    ? 'border-accent-400 bg-accent-500/25 text-content-primary'
                    : 'border-surface-600 bg-surface-850 text-content-secondary hover:border-brand-400'
                } disabled:opacity-40`}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="text-right">
            <p className="text-2xs uppercase tracking-[0.16em] text-content-muted">Costo giro</p>
            <CreditAmount value={totalBet} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-600/70 pt-3">
          <div>
            <p className="text-2xs uppercase tracking-[0.16em] text-content-muted">Saldo</p>
            <CreditAmount value={balance} />
          </div>
          <Button
            variant="accent"
            size="lg"
            disabled={spinning || !affordable}
            loading={busy && !spinning}
            loadingLabel="Invio…"
            onClick={() => void play()}
          >
            {affordable ? '⟳ Gira' : 'Crediti insufficienti'}
          </Button>
        </div>

        {/* Provably fair. Shown because it is the point, not as decoration. */}
        <div className="rounded-lg border border-surface-600/70 bg-surface-850/60 px-3 py-2 text-2xs text-content-muted">
          <p>
            <strong className="text-content-secondary">Verificabile:</strong> l’hash del seed del
            prossimo giro è pubblicato prima che il giro avvenga.
          </p>
          <p className="mt-1 truncate font-mono">
            impegno: {commitment ?? '—'}
          </p>
          {spin && (
            <p className="mt-0.5 truncate font-mono">
              giro #{spin.nonce} · seed rivelato: {spin.serverSeed.slice(0, 32)}…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
