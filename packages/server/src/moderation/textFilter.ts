/**
 * Text filtering for anything a player can type: chat, room names, signage,
 * display names.
 *
 * Two tiers, because they deserve different treatment:
 *  - MASKED terms are ordinary profanity. The message still goes through with
 *    the word starred out; silently dropping it makes players repeat
 *    themselves and blame the game.
 *  - BLOCKED terms are slurs and harassment. The message is refused outright
 *    and the attempt is recorded for moderation.
 *
 * The word lists here are a deliberately small starting point, not a complete
 * policy: they exist so the plumbing is real and tested. Before launch they
 * should be replaced by a maintained list per locale, kept out of source
 * control and loaded at boot.
 */

/** Confusable characters used to slip a word past a naive substring match. */
const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  $: 's',
  '7': 't',
  '8': 'b',
  '9': 'g',
};

/**
 * Folds a string to a comparable form: lowercase, no diacritics, leet
 * characters resolved, runs of the same letter collapsed, separators removed.
 * `c-i-a-o` and `cíaaao` both fold to `ciao`.
 */
export function normalise(input: string): string {
  const lowered = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  let folded = '';
  for (const char of lowered) {
    folded += LEET_MAP[char] ?? char;
  }

  return folded
    .replace(/[^a-z0-9\s]/g, '')
    // Collapse "aaaa" to "aa": keeps real doubles (bella) while killing padding.
    .replace(/(.)\1{2,}/g, '$1$1');
}

/** Ordinary profanity: masked, message still delivered. Italian and English. */
const MASKED_TERMS = [
  'cazzo',
  'stronzo',
  'stronza',
  'coglione',
  'coglioni',
  'vaffanculo',
  'merda',
  'puttana',
  'troia',
  'bastardo',
  'fottiti',
  'fuck',
  'fucking',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'dickhead',
];

/** Slurs and harassment: message refused, attempt recorded. */
const BLOCKED_TERMS = [
  'negro',
  'frocio',
  'ricchione',
  'zingaro',
  'nigger',
  'faggot',
  'retard',
  'tranny',
  'kys',
  'ammazzati',
  'uccidit',
];

/**
 * Matches a term as a whole word in normalised text.
 *
 * Word boundaries are the point: without them "analisi" trips on a substring
 * and "Scunthorpe" becomes unsayable. Prefix matching is allowed only where
 * the term is explicitly a stem (entries ending without a vowel, e.g.
 * `uccidit` covering `ucciditi`).
 */
function buildMatcher(terms: readonly string[]): RegExp {
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\w{0,3}\\b`, 'gi');
}

const MASKED_MATCHER = buildMatcher(MASKED_TERMS.map(normalise));
const BLOCKED_MATCHER = buildMatcher(BLOCKED_TERMS.map(normalise));

export interface FilterResult {
  /** 'ok' delivers `text`; 'masked' delivers the starred text; 'blocked' does not deliver. */
  verdict: 'ok' | 'masked' | 'blocked';
  /** What should actually be delivered. Empty when blocked. */
  text: string;
  /** Terms that matched, for the moderation log. Never shown to players. */
  matches: string[];
}

/**
 * Runs the filter over a player-authored string.
 *
 * Masking happens on the *original* text, using offsets found in the
 * normalised copy would be wrong - normalisation changes length. Instead each
 * whitespace-delimited token is normalised and tested on its own, so the
 * delivered message keeps its original spacing and punctuation.
 */
export function filterText(input: string): FilterResult {
  const trimmed = input.trim();
  if (!trimmed) return { verdict: 'ok', text: '', matches: [] };

  const matches: string[] = [];
  let blocked = false;
  let masked = false;

  const tokens = trimmed.split(/(\s+)/);
  const output = tokens.map((token) => {
    if (/^\s+$/.test(token) || token === '') return token;

    const folded = normalise(token);
    if (!folded) return token;

    BLOCKED_MATCHER.lastIndex = 0;
    if (BLOCKED_MATCHER.test(folded)) {
      blocked = true;
      matches.push(folded);
      return token;
    }

    MASKED_MATCHER.lastIndex = 0;
    if (MASKED_MATCHER.test(folded)) {
      masked = true;
      matches.push(folded);
      // Keep the first character so the sentence stays readable.
      return token[0] + '*'.repeat(Math.max(1, token.length - 1));
    }

    return token;
  });

  if (blocked) return { verdict: 'blocked', text: '', matches };
  if (masked) return { verdict: 'masked', text: output.join(''), matches };
  return { verdict: 'ok', text: trimmed, matches: [] };
}

/**
 * Stricter pass for names that persist and are seen out of context: display
 * names, room names, signage. Any hit at all is refused - there is no reason
 * to accept a starred-out room name.
 */
export function isNameAcceptable(input: string): boolean {
  const result = filterText(input);
  return result.verdict === 'ok';
}
