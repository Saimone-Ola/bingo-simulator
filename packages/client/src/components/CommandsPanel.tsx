import { SHORTCUT_HELP } from '../net/shortcuts';
import { Button } from './ui';

/**
 * The list of controls.
 *
 * Shown once on a player's first visit and reachable from ? or F1 afterwards,
 * because a first person room with no on screen controls is otherwise something
 * you have to be told how to use.
 */
export default function CommandsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="pointer-events-auto w-full max-w-md rounded-2xl border border-surface-500/70 bg-surface-900/95 shadow-panel backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="commands-title"
    >
      <div className="flex items-start justify-between gap-3 border-b border-surface-600/70 px-4 py-3">
        <div>
          <h2 id="commands-title" className="font-display text-lg font-black text-content-primary">
            Comandi
          </h2>
          <p className="text-2xs text-content-muted">
            Premi <kbd className="rounded border border-surface-500 px-1 font-mono">?</kbd> in
            qualsiasi momento per rivedere questo pannello.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Chiudi i comandi">
          ✕
        </Button>
      </div>

      <dl className="grid gap-1.5 px-4 py-4">
        {SHORTCUT_HELP.map((entry) => (
          <div key={entry.keys} className="flex items-center justify-between gap-3">
            <dt className="shrink-0">
              <kbd className="rounded-md border border-surface-500 bg-surface-850 px-2 py-1 font-mono text-2xs font-bold text-content-secondary">
                {entry.keys}
              </kbd>
            </dt>
            <dd className="text-right text-sm text-content-secondary">{entry.label}</dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-surface-600/70 px-4 py-3">
        <Button variant="primary" size="sm" onClick={onClose} className="w-full">
          Ho capito
        </Button>
      </div>
    </div>
  );
}
