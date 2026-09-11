import { HUB_POIS } from '@bingo/shared';
import { useNavigate } from 'react-router-dom';
import { sendTeleport } from '../net/hubConnection';

/**
 * Navigation for enterable spaces. The fountain intentionally does not appear:
 * it is a scenic landmark protected by the shared collision model.
 */
export default function PoiMenu({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();

  /** Destinations that have their own room; the rest teleport within the plaza. */
  const ROUTES: Record<string, string> = {
    bingo_hall: '/bingo?room=TESI-2026',
    slot_arcade: '/arcade',
  };

  const enter = (poiId: string) => {
    onNavigate?.();
    const route = ROUTES[poiId];
    if (route) {
      navigate(route);
      return;
    }
    sendTeleport(poiId);
  };

  return (
    <nav
      className="pointer-events-auto flex flex-col gap-1 rounded-2xl border border-brand-300/20 bg-surface-900/82 p-2.5 shadow-panel backdrop-blur-xl"
      aria-label="Destinazioni"
    >
      <p className="px-1 text-2xs font-semibold uppercase tracking-wide text-content-muted">
        ✦ Destinazioni
      </p>
      {HUB_POIS.map((poi) => (
        <button
          key={poi.id}
          type="button"
          onClick={() => enter(poi.id)}
          className="rounded-lg border border-transparent bg-surface-800/55 px-3 py-2 text-left text-xs font-bold text-content-secondary transition-all hover:-translate-x-1 hover:border-brand-400/30 hover:bg-brand-500/15 hover:text-content-primary"
        >
          <span className="flex items-center justify-between gap-3">
            <span>{poi.label}</span>
            <span className="text-[0.58rem] font-black uppercase tracking-wider text-success-400">
              {ROUTES[poi.id] ? 'Gioca →' : 'Vai →'}
            </span>
          </span>
        </button>
      ))}
      <p className="mt-1 max-w-36 border-t border-surface-600/60 px-1 pt-2 text-[0.58rem] leading-relaxed text-content-muted">
        La fontana è un elemento scenico non accessibile.
      </p>
    </nav>
  );
}
