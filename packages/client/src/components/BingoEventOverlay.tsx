import { useEffect, useMemo, useState } from 'react';
import type { ActiveBingoEvent } from '@bingo/shared';
import {
  subscribeBingoEvents,
  type BingoEventViewState,
} from '../net/bingoEventBus';

const INITIAL_STATE: BingoEventViewState = {
  activeEvent: null,
  eventHistory: [],
  phase: 'WAITING',
  nextDrawAt: null,
};

function EventBackdrop({ event }: { event: ActiveBingoEvent }) {
  if (event.id === 'blackout') {
    return (
      <div className="pointer-events-none fixed inset-0 z-[80] bg-black/78 mix-blend-multiply">
        <div className="absolute inset-x-0 top-0 h-1 bg-red-500/70 shadow-[0_0_28px_#ef4444]" />
        <div className="absolute inset-x-0 bottom-0 h-1 bg-red-500/70 shadow-[0_0_28px_#ef4444]" />
      </div>
    );
  }

  if (event.id === 'confetti') {
    return (
      <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden" aria-hidden="true">
        {Array.from({ length: 34 }, (_, index) => (
          <span
            key={index}
            className="absolute -top-8 h-4 w-2 animate-[fall_3.8s_linear_infinite] rounded-sm bg-current"
            style={{
              left: `${(index * 37) % 100}%`,
              color: ['#fde047', '#f472b6', '#60a5fa', '#34d399', '#fb923c'][index % 5],
              animationDelay: `${(index % 11) * -0.31}s`,
              animationDuration: `${2.8 + (index % 7) * 0.24}s`,
              transform: `rotate(${index * 23}deg)`,
            }}
          />
        ))}
        <style>{`@keyframes fall { to { transform: translate3d(35px, 110vh, 0) rotate(720deg); } }`}</style>
      </div>
    );
  }

  if (event.id === 'zombie-outbreak') {
    return (
      <div className="pointer-events-none fixed inset-0 z-[80] bg-[radial-gradient(circle_at_center,transparent_35%,rgb(20_83_45_/_0.28)_72%,rgb(3_22_11_/_0.72))] shadow-[inset_0_0_120px_#14532d]" />
    );
  }

  if (event.id === 'broken-microphone') {
    return <div className="pointer-events-none fixed inset-0 z-[80] animate-pulse bg-white/[0.018]" />;
  }

  return null;
}

export default function BingoEventOverlay() {
  const [state, setState] = useState<BingoEventViewState>(INITIAL_STATE);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => subscribeBingoEvents(setState), []);
  useEffect(() => {
    if (!state.activeEvent) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [state.activeEvent]);

  const event = state.activeEvent;
  const seconds = useMemo(
    () => (event ? Math.max(0, Math.ceil((event.endsAt - now) / 1_000)) : 0),
    [event, now],
  );

  if (!event || !window.location.pathname.startsWith('/bingo')) return null;

  const isZombie = event.id === 'zombie-outbreak';
  const icon =
    event.id === 'blackout'
      ? '⚡'
      : event.id === 'confetti'
        ? '🎉'
        : event.id === 'broken-microphone'
          ? '🎙️'
          : event.id === 'false-bingo'
            ? '🚨'
            : event.id === 'distracted-waiter'
              ? '🥤'
              : '🧟';

  return (
    <>
      <EventBackdrop event={event} />
      <aside
        className={`pointer-events-none fixed left-1/2 top-4 z-[90] w-[min(92vw,720px)] -translate-x-1/2 overflow-hidden rounded-[1.6rem] border shadow-[0_28px_90px_-30px_#000] backdrop-blur-xl ${
          isZombie
            ? 'border-lime-300/35 bg-[#102718]/92 text-lime-50'
            : 'border-white/15 bg-[#15132b]/92 text-white'
        }`}
        role="status"
        aria-live="assertive"
      >
        <div className="flex items-center gap-4 p-4 sm:p-5">
          <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl ${isZombie ? 'bg-lime-300 text-[#10210e]' : 'bg-white/10'}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] opacity-60">
                Evento sincronizzato · {event.category}
              </p>
              <span className="rounded-full border border-current/15 px-2.5 py-1 text-[10px] font-black">
                {seconds}s
              </span>
            </div>
            <h2 className="mt-1 font-display text-xl font-black sm:text-2xl">{event.name}</h2>
            <p className="mt-1 text-xs leading-5 opacity-70 sm:text-sm">{event.description}</p>
          </div>
        </div>
        <div className="h-1.5 bg-black/25">
          <div
            className={`h-full transition-[width] duration-200 ${isZombie ? 'bg-lime-300' : 'bg-gradient-to-r from-violet-400 via-cyan-300 to-amber-300'}`}
            style={{
              width: `${Math.max(0, Math.min(100, ((event.endsAt - now) / (event.endsAt - event.startedAt)) * 100))}%`,
            }}
          />
        </div>
      </aside>
    </>
  );
}
