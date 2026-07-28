import { describe, expect, it } from 'vitest';
import { ActionRateLimiter } from '../src/realtime/rateLimiter';
import { filterText, isNameAcceptable, normalise } from '../src/moderation/textFilter';

describe('text normalisation', () => {
  it('folds diacritics, leetspeak and padding', () => {
    expect(normalise('CIAO')).toBe('ciao');
    expect(normalise('perché')).toBe('perche');
    expect(normalise('c4zz0')).toBe('cazzo');
    expect(normalise('sheeeeeet')).toBe('sheet');
    expect(normalise('f.u.c.k')).toBe('fuck');
  });
});

describe('chat filter', () => {
  it('lets ordinary Italian through untouched', () => {
    const result = filterText('Ciao a tutti, giochiamo una partita?');
    expect(result.verdict).toBe('ok');
    expect(result.text).toBe('Ciao a tutti, giochiamo una partita?');
  });

  it('masks profanity but still delivers the message', () => {
    const result = filterText('che cazzo di fortuna');
    expect(result.verdict).toBe('masked');
    expect(result.text).not.toContain('cazzo');
    expect(result.text.startsWith('che c')).toBe(true);
    // The rest of the sentence must survive: dropping it makes players repeat
    // themselves and blame the game.
    expect(result.text).toContain('di fortuna');
  });

  it('blocks slurs outright', () => {
    const result = filterText('sei un frocio');
    expect(result.verdict).toBe('blocked');
    expect(result.text).toBe('');
  });

  it('sees through leetspeak evasion', () => {
    expect(filterText('c4zz0').verdict).toBe('masked');
    expect(filterText('f*u*c*k').verdict).toBe('masked');
  });

  it('does not trip on innocent words containing a banned substring', () => {
    // The Scunthorpe problem: substring matching would ruin all of these.
    for (const phrase of [
      'analisi dei risultati',
      'la classifica di Scunthorpe',
      'passa il documento',
      'assistente di sala',
      'costante',
      'un attimo',
    ]) {
      expect(filterText(phrase).verdict, phrase).toBe('ok');
    }
  });

  it('preserves spacing and punctuation of the delivered text', () => {
    const result = filterText('ciao   merda!  come va');
    expect(result.text).toContain('ciao   ');
    expect(result.text).toContain('  come va');
  });

  it('treats an empty or whitespace-only message as empty, not as an error', () => {
    expect(filterText('   ').text).toBe('');
    expect(filterText('   ').verdict).toBe('ok');
  });
});

describe('name acceptability', () => {
  it('refuses any hit at all, not just slurs', () => {
    // A room called "Sala M****" helps nobody; names get the stricter tier.
    expect(isNameAcceptable('Sala del Girasole')).toBe(true);
    expect(isNameAcceptable('sala merda')).toBe(false);
    expect(isNameAcceptable('sala frocio')).toBe(false);
  });
});

describe('action rate limiter', () => {
  it('allows up to the limit and then reports the wait', () => {
    const limiter = new ActionRateLimiter();
    const now = 1_000_000;

    // chatSend is 5 per 5s.
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.check('chatSend', now + i), `call ${i}`).toBeNull();
    }

    const wait = limiter.check('chatSend', now + 5);
    expect(wait).not.toBeNull();
    expect(wait as number).toBeGreaterThan(0);
    expect(wait as number).toBeLessThanOrEqual(5_000);
  });

  it('lets the window slide instead of blocking forever', () => {
    const limiter = new ActionRateLimiter();
    const now = 2_000_000;

    for (let i = 0; i < 5; i += 1) limiter.check('chatSend', now);
    expect(limiter.check('chatSend', now)).not.toBeNull();

    // Past the window, the allowance is back.
    expect(limiter.check('chatSend', now + 5_001)).toBeNull();
  });

  it('keeps separate budgets per action', () => {
    const limiter = new ActionRateLimiter();
    const now = 3_000_000;

    for (let i = 0; i < 5; i += 1) limiter.check('chatSend', now);
    expect(limiter.check('chatSend', now)).not.toBeNull();
    // Spending the chat budget must not stop the player from moving.
    expect(limiter.check('moveIntent', now)).toBeNull();
  });

  it('reports remaining allowance without consuming it', () => {
    const limiter = new ActionRateLimiter();
    const now = 4_000_000;

    expect(limiter.remaining('emote', now)).toBe(6);
    limiter.check('emote', now);
    expect(limiter.remaining('emote', now)).toBe(5);
    expect(limiter.remaining('emote', now)).toBe(5);
  });
});
