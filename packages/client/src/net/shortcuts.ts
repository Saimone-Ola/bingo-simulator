/**
 * Keyboard shortcuts for the hub.
 *
 * Resolution is a pure function of the event and the current context so it can
 * be tested without a DOM and without a running room. The component that binds
 * it only has to decide what to *do* with the action, never whether the key
 * meant anything.
 *
 * Two rules matter more than the table itself:
 *
 * - While the player is typing, the only key that still means something is
 *   Escape. Anything else belongs to the text field, which is what stops a
 *   message about "danza" from making the avatar dance halfway through.
 * - A key held with Ctrl, Meta or Alt is the browser's. Stealing Ctrl+W to
 *   walk forwards would close the tab.
 */

import { EMOTES, type Emote } from '@bingo/shared';

export type HubAction =
  | { kind: 'emote'; emote: Emote }
  /** Use whatever the player is standing in front of. */
  | { kind: 'interact' }
  | { kind: 'chat' }
  | { kind: 'roster' }
  | { kind: 'emoteBar' }
  | { kind: 'help' }
  /** Close the topmost panel, or leave pointer lock if nothing is open. */
  | { kind: 'close' };

/** The parts of a KeyboardEvent this module reads. */
export interface KeyEventLike {
  code: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

export interface ShortcutContext {
  /** A text field has focus. */
  typing: boolean;
}

/** Digit keys, in the order the emote bar shows them. */
const EMOTE_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'] as const;

export function resolveShortcut(
  event: KeyEventLike,
  context: ShortcutContext,
): HubAction | null {
  // Browser and OS combinations are never ours.
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  if (event.code === 'Escape') return { kind: 'close' };

  // Everything below this line is swallowed by an open text field.
  if (context.typing) return null;

  // These are all one-shot actions; auto-repeat would fire them dozens of
  // times while a key was merely being held down.
  if (event.repeat) return null;

  const emoteIndex = EMOTE_KEYS.indexOf(event.code as (typeof EMOTE_KEYS)[number]);
  if (emoteIndex >= 0) {
    const emote = EMOTES[emoteIndex];
    return emote ? { kind: 'emote', emote } : null;
  }

  switch (event.code) {
    case 'KeyE':
      return { kind: 'interact' };
    case 'Space':
      // Sitting is an emote like any other; the shortcut just makes the one
      // people reach for reachable without opening the bar.
      return { kind: 'emote', emote: 'sit' };
    case 'KeyC':
      return { kind: 'emoteBar' };
    case 'Tab':
      return { kind: 'roster' };
    case 'Enter':
      return { kind: 'chat' };
    case 'F1':
      return { kind: 'help' };
    default:
      break;
  }

  // "?" is Shift+/ on some layouts and its own key on others, so it is matched
  // on the produced character rather than on a physical code.
  if (event.key === '?') return { kind: 'help' };

  return null;
}

/**
 * Whether the browser's own handling of a key should be suppressed.
 *
 * Tab would move focus out of the canvas and Space would scroll the page, both
 * of which are worse than useless while walking around a room. Escape is
 * deliberately absent: leaving pointer lock is the browser's job and taking it
 * over is how a page traps someone.
 */
export function shouldPreventDefault(action: HubAction, event: KeyEventLike): boolean {
  if (action.kind === 'close') return false;
  return event.code === 'Tab' || event.code === 'Space' || event.code === 'F1';
}

export interface ShortcutHelp {
  keys: string;
  label: string;
}

/** What the commands panel lists, in the order it lists it. */
export const SHORTCUT_HELP: readonly ShortcutHelp[] = [
  { keys: 'W A S D', label: 'Camminare' },
  { keys: 'Shift', label: 'Correre' },
  { keys: 'Mouse', label: 'Ruotare la visuale' },
  { keys: 'Rotella', label: 'Avvicinare o allontanare la camera' },
  { keys: 'E', label: 'Interagire con quello che hai davanti' },
  { keys: '1 – 6', label: 'Emote rapide' },
  { keys: 'Spazio', label: 'Sedersi e rialzarsi' },
  { keys: 'C', label: 'Mostrare o nascondere la barra delle emote' },
  { keys: 'Invio', label: 'Scrivere in chat' },
  { keys: 'Tab', label: 'Elenco dei presenti' },
  { keys: 'Esc', label: 'Chiudere il pannello aperto' },
  { keys: '? / F1', label: 'Questo pannello' },
];
