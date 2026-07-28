import { EMOTES, EMOTE_LABELS } from '@bingo/shared';
import { sendEmote } from '../net/hubConnection';

/**
 * Emote picker. The server decides whether the emote actually plays - it is
 * rate limited there - so these buttons stay enabled and a refusal surfaces as
 * the usual notice.
 */
export default function EmoteBar() {
  return (
    <div
      className="pointer-events-auto flex flex-wrap gap-1.5 rounded-lg border border-surface-600 bg-surface-800/85 p-2 shadow-hud backdrop-blur"
      role="group"
      aria-label="Emote"
    >
      {EMOTES.map((emote) => (
        <button
          key={emote}
          type="button"
          onClick={() => sendEmote(emote)}
          className="rounded-sm px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-content-secondary transition-colors hover:bg-surface-700 hover:text-content-primary"
        >
          {EMOTE_LABELS[emote]}
        </button>
      ))}
    </div>
  );
}
