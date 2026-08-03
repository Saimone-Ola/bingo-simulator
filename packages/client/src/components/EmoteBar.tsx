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
      className="pointer-events-auto flex flex-wrap gap-1.5 rounded-2xl border border-brand-300/20 bg-surface-900/82 p-2.5 shadow-panel backdrop-blur-xl"
      role="group"
      aria-label="Emote"
    >
      {EMOTES.map((emote) => (
        <button
          key={emote}
          type="button"
          onClick={() => sendEmote(emote)}
          className="rounded-lg border border-surface-600/70 bg-surface-800/70 px-2.5 py-1.5 text-2xs font-bold uppercase tracking-wide text-content-secondary transition-all hover:-translate-y-0.5 hover:border-brand-400/50 hover:bg-brand-500/15 hover:text-content-primary"
        >
          {EMOTE_LABELS[emote]}
        </button>
      ))}
    </div>
  );
}
