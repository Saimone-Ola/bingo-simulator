/**
 * Credits are the one and only in-game currency.
 *
 * They are stored and transported as *integers* (bigint on the wire from the
 * database, plain `number` in the API because JS integers are exact up to
 * 2^53 and no balance will ever come close). There is deliberately no
 * fractional unit: no rounding, no float drift, no conversion to real money.
 */

export type Credits = number;

export const CREDITS_MAX_SAFE = Number.MAX_SAFE_INTEGER;

export function isValidCreditAmount(value: unknown): value is Credits {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value)
  );
}

/** Throws unless `value` is a usable credit amount within [min, max]. */
export function assertCredits(value: unknown, min = 0, max = CREDITS_MAX_SAFE): Credits {
  if (!isValidCreditAmount(value)) {
    throw new TypeError('Credit amounts must be safe integers');
  }
  if (value < min || value > max) {
    throw new RangeError(`Credit amount ${value} outside [${min}, ${max}]`);
  }
  return value;
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Localised display, e.g. `1.250 crediti` in Italian. */
export function formatCredits(value: Credits, locale = 'it-IT'): string {
  let formatter = formatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    formatters.set(locale, formatter);
  }
  return formatter.format(value);
}
