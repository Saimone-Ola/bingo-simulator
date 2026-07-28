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
      className="pointer-events-auto flex flex-col gap-1 rounded-lg border border-surface-600 bg-surface-800/85 p-2 shadow-hud backdrop-blur"
      aria-label="Destinazioni"
    >
      <p className="px-1 text-2xs font-semibold uppercase tracking-wide text-content-muted">
        Vai a
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
            className={`rounded-sm px-2 py-1 text-left text-xs font-medium transition-colors ${
              unlocked
                ? 'text-content-secondary hover:bg-surface-700 hover:text-content-primary'
                : 'cursor-not-allowed text-content-muted opacity-50'
            }`}
          >
            {poi.label}
          </button>
        );
      })}
    </nav>
  );
}
