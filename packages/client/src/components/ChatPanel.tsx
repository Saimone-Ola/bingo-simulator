import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CHAT_MAX_LENGTH } from '@bingo/shared';
import { sendChat } from '../net/hubConnection';
import { setTyping } from '../net/input';
import { useHubStore } from '../store/hub';
import { Button } from './ui';

/**
 * Hub chat.
 *
 * The one non-obvious job here is telling the input layer when a text field
 * has focus: without it, typing "wasd" walks your avatar across the plaza
 * while you write.
 */
export default function ChatPanel({ onClose }: { onClose?: () => void }) {
  const chat = useHubStore((state) => state.chat);
  const myUserId = useHubStore((state) => state.myUserId);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  // Follow new messages, but not while the player is reading scrollback.
  useEffect(() => {
    if (!atBottom.current) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chat]);

  useEffect(() => () => setTyping(false), []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    sendChat(body);
    setDraft('');
  }

  return (
    <section
      className="pointer-events-auto flex h-72 w-full min-w-0 max-w-full flex-col rounded-2xl border border-brand-300/20 bg-surface-900/88 shadow-panel backdrop-blur-xl"
      aria-label="Chat della piazza"
    >
      <header className="flex items-center justify-between border-b border-surface-600/70 bg-brand-500/5 px-3.5 py-2.5">
        <h2 className="text-2xs font-semibold uppercase tracking-wide text-content-muted">
          ● Chat della piazza
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-2xs text-content-muted hover:text-content-primary"
          >
            Chiudi
          </button>
        )}
      </header>

      <div
        ref={listRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          atBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 24;
        }}
        className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2"
      >
        {chat.length === 0 && (
          <p className="text-xs text-content-muted">
            Nessun messaggio. Di’ qualcosa alla piazza.
          </p>
        )}
        {chat.map((message) => (
          <p key={message.id} className="text-xs leading-snug">
            <span
              className={
                message.senderId === myUserId
                  ? 'font-semibold text-brand-300'
                  : 'font-semibold text-content-secondary'
              }
            >
              {message.senderName}
            </span>
            {message.scope === 'private' && (
              <span className="ml-1 text-2xs uppercase text-info-400">privato</span>
            )}
            <span className="ml-1.5 text-content-primary">{message.body}</span>
            {message.filtered && (
              <span className="ml-1 text-2xs text-content-muted">(filtrato)</span>
            )}
          </p>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-surface-600/70 bg-surface-950/30 p-2.5">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, CHAT_MAX_LENGTH))}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          placeholder="Scrivi un messaggio…"
          aria-label="Messaggio"
          className="min-w-0 flex-1 rounded-lg border border-surface-600 bg-surface-950/60 px-3 py-2 text-xs text-content-primary placeholder:text-content-muted focus:border-brand-400 focus:outline-none"
        />
        <Button type="submit" size="sm" disabled={!draft.trim()}>
          Invia
        </Button>
      </form>
    </section>
  );
}
