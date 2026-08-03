import { HUB_POIS } from '@bingo/shared';
import { sendTeleport } from '../net/hubConnection';

/**
 * Teleport menu.
 *
 * Locked destinations are shown greyed rather than hidden: the plaza reads as
 * a place that is being built rather than a place that is empty. The server
 * refuses them anyway, so nothing here is load-bearing for correctness.
 */
const CURRENT_PHASE = 1;

export default function PoiMenu() {
  return (
    <nav
      className="pointer-events-auto flex flex-col gap-1 rounded-2xl border border-brand-300/20 bg-surface-900/82 p-2.5 shadow-panel backdrop-blur-xl"
      aria-label="Destinazioni"
    >
      <p className="px-1 text-2xs font-semibold uppercase tracking-wide text-content-muted">
        ✦ Destinazioni
      </p>
      {HUB_POIS.map((poi) => {
        const unlocked = poi.availableFromPhase <= CURRENT_PHASE;
        return (
          <button
            key={poi.id}
            type="button"
            disabled={!unlocked}
            onClick={() => sendTeleport(poi.id)}
            title={unlocked ? undefined : 'Non ancora disponibile'}
            className={`rounded-lg px-3 py-2 text-left text-xs font-bold transition-all ${
              unlocked
                ? 'border border-transparent bg-surface-800/55 text-content-secondary hover:-translate-x-1 hover:border-brand-400/30 hover:bg-brand-500/15 hover:text-content-primary'
                : 'cursor-not-allowed border border-transparent text-content-muted opacity-40'
            }`}
          >
            {poi.label}
          </button>
        );
      })}
    </nav>
  );
}
