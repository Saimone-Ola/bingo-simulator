import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BINGO_FREE_INDEX,
  bingoLetter,
  normaliseBingoRoomCode,
  type BingoClaimRejectedPayload,
  type BingoPlayerSummary,
  type BingoSnapshotPayload,
  type BingoWinnerPayload,
} from '@bingo/shared';
import { Button, ResponsiblePlayNotice } from '../components/ui';
import {
  claimBingo,
  connectToBingo,
  leaveBingo,
  type BingoConnectionStatus,
} from '../net/bingoConnection';
import { useAuthStore } from '../store/auth';

const COLUMNS = ['B', 'I', 'N', 'G', 'O'] as const;

const REJECTION_COPY: Record<BingoClaimRejectedPayload['reason'], string> = {
  round_changed: 'Il round è già cambiato: usa la nuova cartella.',
  incomplete_line: 'Non c’è ancora una cinquina completa sulla cartella.',
  round_locked: 'Il round è già stato vinto. Il prossimo inizia tra poco.',
};

function Ball({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = {
    sm: 'h-10 w-10 text-xs',
    md: 'h-14 w-14 text-base',
    lg: 'h-32 w-32 text-4xl',
  }[size];

  return (
    <div
      className={`grid ${dimensions} shrink-0 place-items-center rounded-full border-4 border-white/55 bg-[radial-gradient(circle_at_32%_24%,#fff_0_7%,#fff3cc_8%,#ffc655_48%,#d98200_100%)] font-display font-black text-[#2d1a00] shadow-[inset_-10px_-12px_20px_rgb(116_60_0_/_0.3),inset_8px_8px_16px_rgb(255_255_255_/_0.65),0_16px_45px_-14px_rgb(255_176_32_/_0.9)]`}
      aria-label={`${bingoLetter(value)} ${value}`}
    >
      <span>{bingoLetter(value)}{value}</span>
    </div>
  );
}

function PlayerList({ players }: { players: BingoPlayerSummary[] }) {
  return (
    <aside className="rounded-2xl border border-brand-300/20 bg-surface-900/72 p-4 shadow-panel backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-2xs font-black uppercase tracking-[0.18em] text-brand-300">Tavolo live</p>
          <h2 className="font-display text-lg font-black">Amici in sala</h2>
        </div>
        <span className="rounded-full border border-success-500/45 bg-success-500/10 px-2.5 py-1 text-xs font-black text-success-400">
          {players.length}/20
        </span>
      </div>
      <div className="grid gap-2">
        {players.map((player, index) => (
          <div key={player.sessionId} className="flex items-center gap-3 rounded-xl border border-surface-600/65 bg-surface-950/30 p-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 font-black text-white shadow-glow-brand">
              {player.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-content-primary">{player.displayName}</p>
              <p className="text-2xs text-content-muted">Livello {player.level}</p>
            </div>
            <span className="text-2xs font-bold uppercase tracking-wider text-success-400">
              {index === 0 ? 'Host' : 'Online'}
            </span>
          </div>
        ))}
        {players.length === 0 && (
          <p className="rounded-xl border border-dashed border-surface-500 p-4 text-center text-xs text-content-muted">
            Connessione dei giocatori…
          </p>
        )}
      </div>
    </aside>
  );
}

export default function BingoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);

  const roomCode = useMemo(
    () => normaliseBingoRoomCode(searchParams.get('room') ?? 'TESI-2026'),
    [searchParams],
  );

  const [status, setStatus] = useState<BingoConnectionStatus>('connecting');
  const [round, setRound] = useState(1);
  const [card, setCard] = useState<number[]>([]);
  const [calledBalls, setCalledBalls] = useState<number[]>([]);
  const [currentBall, setCurrentBall] = useState<number | null>(null);
  const [players, setPlayers] = useState<BingoPlayerSummary[]>([]);
  const [marked, setMarked] = useState<Set<number>>(new Set([BINGO_FREE_INDEX]));
  const [nextDrawAt, setNextDrawAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const [winner, setWinner] = useState<BingoWinnerPayload | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;

    const applySnapshot = (snapshot: BingoSnapshotPayload) => {
      if (!active) return;
      setRound(snapshot.round);
      setCard(snapshot.card);
      setCalledBalls(snapshot.calledBalls);
      setCurrentBall(snapshot.currentBall);
      setPlayers(snapshot.players);
      setNextDrawAt(snapshot.nextDrawAt);
      setMarked(new Set([BINGO_FREE_INDEX]));
      setWinner(null);
      setNotice(null);
    };

    void connectToBingo(accessToken, roomCode, {
      onStatus: setStatus,
      onSnapshot: applySnapshot,
      onBall: (payload) => {
        if (!active) return;
        setRound(payload.round);
        setCurrentBall(payload.ball);
        setCalledBalls(payload.calledBalls);
        setNextDrawAt(payload.nextDrawAt);
      },
      onPlayers: (nextPlayers) => active && setPlayers(nextPlayers),
      onWinner: (payload) => {
        if (!active) return;
        setWinner(payload);
        setNotice(null);
      },
      onClaimRejected: (payload) => {
        if (active) setNotice(REJECTION_COPY[payload.reason]);
      },
      onRoundReset: (payload) => {
        if (!active) return;
        setRound(payload.round);
        setNextDrawAt(payload.startsAt);
        setNotice('Nuovo round in preparazione…');
      },
    }).catch(() => {
      if (active) setStatus('failed');
    });

    return () => {
      active = false;
      void leaveBingo();
    };
  }, [accessToken, roomCode]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const called = useMemo(() => new Set(calledBalls), [calledBalls]);
  const countdown = Math.max(0, Math.ceil((nextDrawAt - now) / 1000));
  const progress = Math.min(100, (calledBalls.length / 75) * 100);

  const toggleMark = (index: number) => {
    if (index === BINGO_FREE_INDEX || !called.has(card[index]!)) return;
    setMarked((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const copyInvite = async () => {
    const url = new URL('/bingo', window.location.origin);
    url.searchParams.set('room', roomCode);
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  };

  const createNewRoom = () => {
    const code = `TESI-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    navigate(`/bingo?room=${code}`);
  };

  return (
    <main className="relative min-h-full overflow-x-hidden bg-[radial-gradient(circle_at_50%_-10%,rgb(124_92_255_/_0.34),transparent_42rem),radial-gradient(circle_at_100%_80%,rgb(62_201_224_/_0.16),transparent_34rem),linear-gradient(145deg,#070611,#100b2a)] text-content-primary">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(255_255_255_/_0.025)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255_/_0.025)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <header className="relative z-10 border-b border-brand-300/15 bg-surface-950/55 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-7">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/hub')}>
              ← Piazza
            </Button>
            <div>
              <p className="text-2xs font-black uppercase tracking-[0.2em] text-accent-300">Sala condivisa</p>
              <h1 className="font-display text-xl font-black">Bingo Night · Round {round}</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="rounded-lg border border-brand-300/25 bg-brand-500/10 px-3 py-1.5">
              <span className="text-2xs uppercase tracking-wider text-content-muted">Codice </span>
              <strong className="font-mono text-sm text-brand-100">{roomCode}</strong>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void copyInvite()}>
              {copied ? '✓ Link copiato' : '⇧ Invita amici'}
            </Button>
            <Button variant="ghost" size="sm" onClick={createNewRoom}>
              + Nuova sala
            </Button>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto grid max-w-[1500px] gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:px-7">
        <section className="grid gap-5">
          <div className="grid gap-4 rounded-2xl border border-brand-300/20 bg-surface-900/66 p-5 shadow-panel backdrop-blur-xl md:grid-cols-[15rem_1fr]">
            <div className="grid place-items-center rounded-2xl border border-accent-400/25 bg-[radial-gradient(circle,#4b337c,#1a1238)] p-5">
              {currentBall ? (
                <div className="grid place-items-center gap-3" aria-live="polite">
                  <Ball value={currentBall} size="lg" />
                  <p className="text-center text-sm font-black text-accent-300">Numero estratto</p>
                </div>
              ) : (
                <div className="grid h-40 place-items-center text-center">
                  <p className="font-display text-2xl font-black text-content-secondary">Si parte!</p>
                </div>
              )}
            </div>

            <div className="grid content-between gap-5">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-2xs font-black uppercase tracking-[0.18em] text-info-400">Regia server</p>
                    <h2 className="font-display text-2xl font-black">
                      {status === 'connected' ? `Prossima estrazione tra ${countdown}s` : 'Connessione alla sala…'}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-content-secondary">
                      Seleziona i numeri già estratti sulla cartella. Quando completi una riga, una colonna o una diagonale, chiama BINGO.
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wider ${
                    status === 'connected'
                      ? 'border-success-500/50 bg-success-500/10 text-success-400'
                      : status === 'failed'
                        ? 'border-danger-500/50 bg-danger-500/10 text-danger-400'
                        : 'border-warning-500/50 bg-warning-500/10 text-warning-400'
                  }`}>
                    ● {status === 'connected' ? 'Live' : status === 'failed' ? 'Errore rete' : 'Connessione'}
                  </span>
                </div>

                <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-950/65">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-500 via-info-400 to-accent-400 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-2xs text-content-muted">
                  <span>{calledBalls.length} estratti</span>
                  <span>75 totali</span>
                </div>
              </div>

              <div className="flex min-h-14 flex-wrap gap-2">
                {calledBalls.slice(-10).reverse().map((ball) => <Ball key={ball} value={ball} size="sm" />)}
                {calledBalls.length === 0 && <p className="self-center text-xs text-content-muted">Lo storico apparirà qui.</p>}
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_15rem]">
            <section className="rounded-2xl border border-brand-300/25 bg-gradient-to-br from-surface-800/95 to-surface-900/95 p-4 shadow-panel sm:p-6">
              <div className="mx-auto max-w-3xl">
                <div className="mb-2 grid grid-cols-5 gap-2">
                  {COLUMNS.map((letter, index) => (
                    <div key={letter} className={`grid h-12 place-items-center rounded-xl bg-gradient-to-b ${
                      index === 0 ? 'from-info-400 to-info-600' :
                      index === 1 ? 'from-brand-400 to-brand-700' :
                      index === 2 ? 'from-accent-300 to-accent-600 text-content-inverse' :
                      index === 3 ? 'from-success-400 to-success-600' :
                      'from-danger-400 to-danger-600'
                    } font-display text-2xl font-black shadow-raised`}>
                      {letter}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-5 gap-2" aria-label="Cartella Bingo">
                  {Array.from({ length: 25 }, (_value, index) => {
                    const number = card[index];
                    const free = index === BINGO_FREE_INDEX;
                    const isCalled = number !== undefined && called.has(number);
                    const isMarked = marked.has(index);
                    return (
                      <button
                        key={index}
                        type="button"
                        disabled={!free && !isCalled}
                        onClick={() => toggleMark(index)}
                        aria-pressed={isMarked}
                        className={`aspect-square min-h-12 rounded-xl border font-display text-lg font-black transition sm:text-2xl ${
                          isMarked
                            ? 'scale-[0.96] border-accent-300 bg-gradient-to-br from-accent-300 to-accent-600 text-content-inverse shadow-glow-accent'
                            : isCalled
                              ? 'border-brand-300 bg-brand-500/22 text-content-primary hover:scale-105 hover:bg-brand-500/35'
                              : 'border-surface-500/70 bg-surface-950/42 text-content-secondary'
                        } disabled:cursor-default`}
                      >
                        {free ? <span className="text-xs font-black sm:text-sm">FREE<br />★</span> : number ?? '—'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <div className="grid content-start gap-3">
              <Button
                variant="accent"
                size="lg"
                disabled={status !== 'connected' || card.length !== 25 || Boolean(winner)}
                className="min-h-20 w-full text-xl"
                onClick={() => claimBingo(round)}
              >
                ★ CHIAMA BINGO
              </Button>
              <div className="rounded-xl border border-surface-600/70 bg-surface-900/55 p-3 text-xs leading-relaxed text-content-muted">
                La vincita viene controllata dal server sulla cartella assegnata. Nessun risultato dipende dal browser.
              </div>
              <div className="rounded-xl border border-info-500/30 bg-info-500/8 p-3">
                <p className="text-2xs font-black uppercase tracking-wider text-info-400">Giocatore</p>
                <p className="mt-1 font-black">{user?.displayName}</p>
              </div>
            </div>
          </div>
        </section>

        <PlayerList players={players} />
      </div>

      {(notice || winner) && (
        <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center px-4" aria-live="assertive">
          <div className={`max-w-xl rounded-2xl border px-5 py-4 text-center shadow-panel backdrop-blur-xl ${
            winner
              ? 'border-accent-300 bg-[#2f1d05]/95 text-accent-100 shadow-glow-accent'
              : 'border-warning-500/50 bg-surface-900/95 text-warning-400'
          }`}>
            {winner ? (
              <>
                <p className="text-2xs font-black uppercase tracking-[0.2em]">Vittoria verificata</p>
                <p className="mt-1 font-display text-2xl font-black">BINGO di {winner.displayName}!</p>
                <p className="mt-1 text-xs opacity-80">Nuovo round tra pochi secondi.</p>
              </>
            ) : notice}
          </div>
        </div>
      )}

      <ResponsiblePlayNotice className="relative z-10 mx-auto max-w-4xl px-4 pb-5" />
    </main>
  );
}
