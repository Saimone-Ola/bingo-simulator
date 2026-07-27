/**
 * Ledger vocabulary.
 *
 * Every credit movement in the game is an append-only ledger entry with one of
 * these reasons. Balances are never updated in isolation: the materialised
 * `wallets.balance` column is a cache of `sum(ledger_entries.amount)` and is
 * checked against it.
 */

export const LEDGER_REASONS = [
  // Account lifecycle
  'welcome_bonus',
  'admin_adjustment',
  // Bingo
  'bingo_card_purchase',
  'bingo_card_refund',
  'bingo_prize',
  'bingo_jackpot',
  'bingo_jackpot_contribution',
  // Slots
  'slot_bet',
  'slot_win',
  // Prize games
  'prize_game_reward',
  // Shop
  'shop_purchase',
  'shop_refund',
  // Progression
  'daily_login_reward',
  'quest_reward',
  'achievement_reward',
  'level_up_reward',
] as const;

export type LedgerReason = (typeof LEDGER_REASONS)[number];

/** What the entry is attached to, for auditing and for the account statement. */
export const LEDGER_REF_TYPES = [
  'none',
  'bingo_game',
  'bingo_card',
  'slot_spin',
  'prize_claim',
  'item',
  'user',
] as const;

export type LedgerRefType = (typeof LEDGER_REF_TYPES)[number];

/** Reasons that may only ever produce a negative amount. */
export const DEBIT_ONLY_REASONS: ReadonlySet<LedgerReason> = new Set([
  'bingo_card_purchase',
  'bingo_jackpot_contribution',
  'slot_bet',
  'shop_purchase',
]);

/** Reasons that may only ever produce a positive amount. */
export const CREDIT_ONLY_REASONS: ReadonlySet<LedgerReason> = new Set([
  'welcome_bonus',
  'bingo_card_refund',
  'bingo_prize',
  'bingo_jackpot',
  'slot_win',
  'prize_game_reward',
  'shop_refund',
  'daily_login_reward',
  'quest_reward',
  'achievement_reward',
  'level_up_reward',
]);

export function isLedgerAmountSignValid(reason: LedgerReason, amount: number): boolean {
  if (amount === 0) return false;
  if (DEBIT_ONLY_REASONS.has(reason)) return amount < 0;
  if (CREDIT_ONLY_REASONS.has(reason)) return amount > 0;
  return true; // admin_adjustment can go either way
}
