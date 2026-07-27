import { pgEnum } from 'drizzle-orm/pg-core';
import { LEDGER_REASONS, LEDGER_REF_TYPES, LOCALES, USER_ROLES, USER_STATUSES } from '@bingo/shared';

/**
 * Postgres enums. Shared vocabularies come from @bingo/shared so the database,
 * the API and the client can never disagree about what a value means.
 */

export const userRoleEnum = pgEnum('user_role', USER_ROLES);
export const userStatusEnum = pgEnum('user_status', USER_STATUSES);
export const localeEnum = pgEnum('locale', LOCALES);

export const ledgerReasonEnum = pgEnum('ledger_reason', LEDGER_REASONS);
export const ledgerRefTypeEnum = pgEnum('ledger_ref_type', LEDGER_REF_TYPES);

export const itemCategoryEnum = pgEnum('item_category', [
  'outfit',
  'hat',
  'hair',
  'face',
  'accessory',
  'emote',
  'furniture',
  'room_theme',
  'slot_skin',
]);

/** Avatar attachment points. `null` for non-wearable items. */
export const itemSlotEnum = pgEnum('item_slot', [
  'head',
  'hair',
  'face',
  'torso',
  'legs',
  'feet',
  'back',
  'hands',
]);

export const rarityEnum = pgEnum('rarity', ['common', 'rare', 'epic', 'legendary']);

export const acquisitionEnum = pgEnum('acquisition', ['purchase', 'prize', 'reward', 'grant']);

export const roomKindEnum = pgEnum('room_kind', ['bingo', 'slots', 'hub_zone']);
export const roomVisibilityEnum = pgEnum('room_visibility', ['public', 'private']);
export const roomStatusEnum = pgEnum('room_status', ['draft', 'open', 'closed', 'archived']);

export const moderationStateEnum = pgEnum('moderation_state', [
  'ok',
  'pending_review',
  'flagged',
  'blocked',
]);

export const bingoModeEnum = pgEnum('bingo_mode', [
  'standard',
  'blackout',
  'custom_pattern',
  'teams',
  'elimination',
  'themed',
]);

export const bingoMarkingEnum = pgEnum('bingo_marking', ['manual', 'auto']);
export const bingoCallerEnum = pgEnum('bingo_caller', ['auto', 'manual']);

export const bingoGameStatusEnum = pgEnum('bingo_game_status', [
  'scheduled',
  'selling',
  'running',
  'paused',
  'finished',
  'cancelled',
]);

/** Prize tiers, in the order they are awarded during a game. */
export const bingoPrizeTierEnum = pgEnum('bingo_prize_tier', [
  'ambo',
  'terna',
  'quaterna',
  'cinquina',
  'bingo',
  'blackout',
  'custom_pattern',
  'jackpot',
]);

export const slotVolatilityEnum = pgEnum('slot_volatility', ['low', 'medium', 'high', 'extreme']);

export const slotStatusEnum = pgEnum('slot_status', [
  'draft',
  'pending_review',
  'published',
  'rejected',
  'archived',
]);

export const prizeGameKindEnum = pgEnum('prize_game_kind', [
  'wheel',
  'scratch_card',
  'pick_a_box',
  'prize_ladder',
  'shooting_range',
]);

export const friendshipStatusEnum = pgEnum('friendship_status', [
  'pending',
  'accepted',
  'declined',
  'blocked',
]);

export const chatScopeEnum = pgEnum('chat_scope', ['global', 'room', 'private']);

export const reportTargetEnum = pgEnum('report_target', [
  'user',
  'room',
  'chat_message',
  'slot_machine',
]);

export const reportReasonEnum = pgEnum('report_reason', [
  'harassment',
  'hate_speech',
  'sexual_content',
  'spam',
  'cheating',
  'impersonation',
  'other',
]);

export const reportStatusEnum = pgEnum('report_status', [
  'open',
  'reviewing',
  'resolved',
  'dismissed',
]);
