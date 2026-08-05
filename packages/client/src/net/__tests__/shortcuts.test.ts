import { describe, expect, it } from 'vitest';
import { EMOTES } from '@bingo/shared';
import {
  SHORTCUT_HELP,
  resolveShortcut,
  shouldPreventDefault,
  type KeyEventLike,
} from '../shortcuts';

function press(code: string, overrides: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    code,
    key: code.startsWith('Digit') ? code.slice(5) : code,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...overrides,
  };
}

const PLAYING = { typing: false };
const TYPING = { typing: true };

describe('hub shortcuts', () => {
  it('maps the digits to the emotes in the order the bar shows them', () => {
    const codes = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
    codes.forEach((code, index) => {
      expect(resolveShortcut(press(code), PLAYING)).toEqual({
        kind: 'emote',
        emote: EMOTES[index],
      });
    });
  });

  it('has an action for every key the help panel advertises', () => {
    // The panel is a promise to the player; this stops it drifting from what
    // the code actually does.
    const advertised = [
      ['KeyE', 'interact'],
      ['Space', 'emote'],
      ['KeyC', 'emoteBar'],
      ['Enter', 'chat'],
      ['Tab', 'roster'],
      ['Escape', 'close'],
      ['F1', 'help'],
    ] as const;
    for (const [code, kind] of advertised) {
      expect(resolveShortcut(press(code), PLAYING)?.kind).toBe(kind);
    }
    expect(SHORTCUT_HELP.length).toBeGreaterThan(0);
  });

  it('sits on the space bar', () => {
    expect(resolveShortcut(press('Space'), PLAYING)).toEqual({ kind: 'emote', emote: 'sit' });
  });

  it('opens the help on ? whatever the layout puts it on', () => {
    expect(resolveShortcut(press('Slash', { key: '?', shiftKey: true }), PLAYING)?.kind).toBe(
      'help',
    );
    expect(resolveShortcut(press('BracketRight', { key: '?' }), PLAYING)?.kind).toBe('help');
  });

  describe('while typing', () => {
    it('lets every ordinary key through to the text field', () => {
      for (const code of ['Digit1', 'KeyE', 'Space', 'KeyC', 'Tab', 'Enter', 'F1']) {
        expect(resolveShortcut(press(code), TYPING)).toBeNull();
      }
    });

    it('still closes on Escape', () => {
      expect(resolveShortcut(press('Escape'), TYPING)).toEqual({ kind: 'close' });
    });

    it('does not dance when someone types the word', () => {
      expect(resolveShortcut(press('Digit3', { key: '3' }), TYPING)).toBeNull();
    });
  });

  it('leaves browser and OS combinations alone', () => {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(resolveShortcut(press('KeyC', { [modifier]: true }), PLAYING)).toBeNull();
      expect(resolveShortcut(press('Escape', { [modifier]: true }), PLAYING)).toBeNull();
    }
  });

  it('ignores auto-repeat so a held key fires once', () => {
    expect(resolveShortcut(press('Digit1', { repeat: true }), PLAYING)).toBeNull();
    expect(resolveShortcut(press('KeyE', { repeat: true }), PLAYING)).toBeNull();
  });

  it('does not swallow an unmapped key', () => {
    expect(resolveShortcut(press('KeyZ'), PLAYING)).toBeNull();
    expect(resolveShortcut(press('Digit9'), PLAYING)).toBeNull();
  });

  describe('default handling', () => {
    it('suppresses the keys whose browser behaviour would fight the game', () => {
      const tab = press('Tab');
      const space = press('Space');
      expect(shouldPreventDefault(resolveShortcut(tab, PLAYING)!, tab)).toBe(true);
      expect(shouldPreventDefault(resolveShortcut(space, PLAYING)!, space)).toBe(true);
    });

    it('never takes Escape away from the browser', () => {
      // Holding on to Escape is how a page traps someone in pointer lock.
      const escape = press('Escape');
      expect(shouldPreventDefault(resolveShortcut(escape, PLAYING)!, escape)).toBe(false);
    });

    it('leaves Enter and the digits to behave normally', () => {
      const enter = press('Enter');
      const digit = press('Digit1');
      expect(shouldPreventDefault(resolveShortcut(enter, PLAYING)!, enter)).toBe(false);
      expect(shouldPreventDefault(resolveShortcut(digit, PLAYING)!, digit)).toBe(false);
    });
  });
});
