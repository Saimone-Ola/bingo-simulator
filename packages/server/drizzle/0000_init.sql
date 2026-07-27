CREATE TYPE "public"."acquisition" AS ENUM('purchase', 'prize', 'reward', 'grant');--> statement-breakpoint
CREATE TYPE "public"."bingo_caller" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."bingo_game_status" AS ENUM('scheduled', 'selling', 'running', 'paused', 'finished', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."bingo_marking" AS ENUM('manual', 'auto');--> statement-breakpoint
CREATE TYPE "public"."bingo_mode" AS ENUM('standard', 'blackout', 'custom_pattern', 'teams', 'elimination', 'themed');--> statement-breakpoint
CREATE TYPE "public"."bingo_prize_tier" AS ENUM('ambo', 'terna', 'quaterna', 'cinquina', 'bingo', 'blackout', 'custom_pattern', 'jackpot');--> statement-breakpoint
CREATE TYPE "public"."chat_scope" AS ENUM('global', 'room', 'private');--> statement-breakpoint
CREATE TYPE "public"."friendship_status" AS ENUM('pending', 'accepted', 'declined', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."item_category" AS ENUM('outfit', 'hat', 'hair', 'face', 'accessory', 'emote', 'furniture', 'room_theme', 'slot_skin');--> statement-breakpoint
CREATE TYPE "public"."item_slot" AS ENUM('head', 'hair', 'face', 'torso', 'legs', 'feet', 'back', 'hands');--> statement-breakpoint
CREATE TYPE "public"."ledger_reason" AS ENUM('welcome_bonus', 'admin_adjustment', 'bingo_card_purchase', 'bingo_card_refund', 'bingo_prize', 'bingo_jackpot', 'bingo_jackpot_contribution', 'slot_bet', 'slot_win', 'prize_game_reward', 'shop_purchase', 'shop_refund', 'daily_login_reward', 'quest_reward', 'achievement_reward', 'level_up_reward');--> statement-breakpoint
CREATE TYPE "public"."ledger_ref_type" AS ENUM('none', 'bingo_game', 'bingo_card', 'slot_spin', 'prize_claim', 'item', 'user');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('it', 'en');--> statement-breakpoint
CREATE TYPE "public"."moderation_state" AS ENUM('ok', 'pending_review', 'flagged', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."prize_game_kind" AS ENUM('wheel', 'scratch_card', 'pick_a_box', 'prize_ladder', 'shooting_range');--> statement-breakpoint
CREATE TYPE "public"."rarity" AS ENUM('common', 'rare', 'epic', 'legendary');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('harassment', 'hate_speech', 'sexual_content', 'spam', 'cheating', 'impersonation', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'reviewing', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('user', 'room', 'chat_message', 'slot_machine');--> statement-breakpoint
CREATE TYPE "public"."room_kind" AS ENUM('bingo', 'slots', 'hub_zone');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('draft', 'open', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."room_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."slot_status" AS ENUM('draft', 'pending_review', 'published', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."slot_volatility" AS ENUM('low', 'medium', 'high', 'extreme');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('player', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"user_agent" varchar(400),
	"ip_address" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"rotated_to_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avatars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"body_type" varchar(24) DEFAULT 'neutral' NOT NULL,
	"skin_tone" varchar(16) DEFAULT '#e0b49a' NOT NULL,
	"hair_style" varchar(32) DEFAULT 'short' NOT NULL,
	"hair_color" varchar(16) DEFAULT '#2b2118' NOT NULL,
	"face_id" varchar(32) DEFAULT 'face_01' NOT NULL,
	"height_cm" smallint DEFAULT 175 NOT NULL,
	"equipped" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"colorway" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avatars_height_range" CHECK ("avatars"."height_cm" between 140 and 210)
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"addressee_id" uuid NOT NULL,
	"status" "friendship_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "friendships_no_self" CHECK ("friendships"."requester_id" <> "friendships"."addressee_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" varchar(20) NOT NULL,
	"role" "user_role" DEFAULT 'player' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"locale" "locale" DEFAULT 'it' NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"experience" integer DEFAULT 0 NOT NULL,
	"age_acknowledged_at" timestamp with time zone,
	"session_limit_minutes" smallint,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"suspended_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wardrobe_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(40) NOT NULL,
	"equipped" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"colorway" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_favourite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"category" "item_category" NOT NULL,
	"slot" "item_slot",
	"rarity" "rarity" DEFAULT 'common' NOT NULL,
	"price_credits" bigint,
	"purchasable" boolean DEFAULT false NOT NULL,
	"rotation_week" integer,
	"mesh_url" text,
	"thumbnail_url" text,
	"atlas_id" varchar(40),
	"triangle_count" integer DEFAULT 0 NOT NULL,
	"tintable" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_price_requires_purchasable" CHECK (("items"."purchasable" = false) or ("items"."price_credits" is not null and "items"."price_credits" >= 0))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"sequence" bigint NOT NULL,
	"reason" "ledger_reason" NOT NULL,
	"ref_type" "ledger_ref_type" DEFAULT 'none' NOT NULL,
	"ref_id" uuid,
	"idempotency_key" varchar(128),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_non_zero" CHECK ("ledger_entries"."amount" <> 0),
	CONSTRAINT "ledger_entries_balance_non_negative" CHECK ("ledger_entries"."balance_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"acquired_via" "acquisition" NOT NULL,
	"ledger_entry_id" uuid,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_inventory_quantity_positive" CHECK ("user_inventory"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"entry_count" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_balance_non_negative" CHECK ("wallets"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bingo_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"card_index" smallint NOT NULL,
	"numbers" jsonb NOT NULL,
	"marked_mask" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_paid_credits" bigint NOT NULL,
	"ledger_entry_id" uuid,
	"awarded_tiers" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bingo_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"ball_count" smallint DEFAULT 90 NOT NULL,
	"card_format" jsonb NOT NULL,
	"card_price_credits" bigint DEFAULT 10 NOT NULL,
	"max_cards_per_player" smallint DEFAULT 4 NOT NULL,
	"prizes" jsonb NOT NULL,
	"progressive_jackpot_enabled" boolean DEFAULT false NOT NULL,
	"jackpot_contribution_bps" smallint DEFAULT 0 NOT NULL,
	"draw_interval_ms" integer DEFAULT 4000 NOT NULL,
	"marking" "bingo_marking" DEFAULT 'manual' NOT NULL,
	"caller" "bingo_caller" DEFAULT 'auto' NOT NULL,
	"mode" "bingo_mode" DEFAULT 'standard' NOT NULL,
	"custom_pattern" jsonb,
	"team_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bingo_configs_ball_count_range" CHECK ("bingo_configs"."ball_count" between 30 and 120),
	CONSTRAINT "bingo_configs_draw_interval_range" CHECK ("bingo_configs"."draw_interval_ms" between 1000 and 30000),
	CONSTRAINT "bingo_configs_max_cards_range" CHECK ("bingo_configs"."max_cards_per_player" between 1 and 20),
	CONSTRAINT "bingo_configs_price_non_negative" CHECK ("bingo_configs"."card_price_credits" >= 0),
	CONSTRAINT "bingo_configs_jackpot_bps_range" CHECK ("bingo_configs"."jackpot_contribution_bps" between 0 and 2000),
	CONSTRAINT "bingo_configs_pattern_required" CHECK (("bingo_configs"."mode" <> 'custom_pattern') or ("bingo_configs"."custom_pattern" is not null))
);
--> statement-breakpoint
CREATE TABLE "bingo_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"status" "bingo_game_status" DEFAULT 'scheduled' NOT NULL,
	"server_seed_hash" varchar(64) NOT NULL,
	"server_seed" varchar(128),
	"drawn_numbers" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"cards_sold" integer DEFAULT 0 NOT NULL,
	"pot_credits" bigint DEFAULT 0 NOT NULL,
	"jackpot_credits" bigint DEFAULT 0 NOT NULL,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(48) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"description" varchar(280),
	"kind" "room_kind" NOT NULL,
	"theme" varchar(40) DEFAULT 'classic' NOT NULL,
	"capacity" smallint DEFAULT 20 NOT NULL,
	"visibility" "room_visibility" DEFAULT 'public' NOT NULL,
	"join_code_hash" text,
	"status" "room_status" DEFAULT 'draft' NOT NULL,
	"layout" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visit_count" bigint DEFAULT 0 NOT NULL,
	"games_played" bigint DEFAULT 0 NOT NULL,
	"moderation_state" "moderation_state" DEFAULT 'ok' NOT NULL,
	"moderation_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_capacity_range" CHECK ("rooms"."capacity" between 2 and 60),
	CONSTRAINT "rooms_private_requires_code" CHECK (("rooms"."visibility" = 'public') or ("rooms"."join_code_hash" is not null))
);
--> statement-breakpoint
CREATE TABLE "slot_machines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"room_id" uuid,
	"name" varchar(48) NOT NULL,
	"description" varchar(280),
	"reels" smallint DEFAULT 5 NOT NULL,
	"rows" smallint DEFAULT 3 NOT NULL,
	"paylines" jsonb NOT NULL,
	"symbols" jsonb NOT NULL,
	"paytable" jsonb NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"volatility" "slot_volatility" DEFAULT 'medium' NOT NULL,
	"min_bet_credits" bigint DEFAULT 1 NOT NULL,
	"max_bet_credits" bigint DEFAULT 100 NOT NULL,
	"rtp_theoretical" numeric(6, 4),
	"rtp_simulated" numeric(6, 4),
	"rtp_simulation_spins" bigint,
	"rtp_computed_at" timestamp with time zone,
	"status" "slot_status" DEFAULT 'draft' NOT NULL,
	"rejection_reason" varchar(280),
	"version" integer DEFAULT 1 NOT NULL,
	"config_hash" varchar(64),
	"total_spins" bigint DEFAULT 0 NOT NULL,
	"total_wagered" bigint DEFAULT 0 NOT NULL,
	"total_paid_out" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slot_machines_reels_range" CHECK ("slot_machines"."reels" in (3, 5)),
	CONSTRAINT "slot_machines_rows_range" CHECK ("slot_machines"."rows" between 1 and 5),
	CONSTRAINT "slot_machines_bet_range" CHECK ("slot_machines"."min_bet_credits" between 1 and "slot_machines"."max_bet_credits"),
	CONSTRAINT "slot_machines_published_rtp_window" CHECK (("slot_machines"."status" <> 'published') or ("slot_machines"."rtp_theoretical" between 0.85 and 0.98))
);
--> statement-breakpoint
CREATE TABLE "slot_spins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machine_id" uuid NOT NULL,
	"machine_version" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"bet_credits" bigint NOT NULL,
	"win_credits" bigint DEFAULT 0 NOT NULL,
	"server_seed_hash" varchar(64) NOT NULL,
	"server_seed" varchar(128),
	"nonce" bigint NOT NULL,
	"result_grid" jsonb NOT NULL,
	"line_wins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feature_results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"bet_ledger_entry_id" uuid,
	"win_ledger_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slot_spins_bet_positive" CHECK ("slot_spins"."bet_credits" > 0),
	CONSTRAINT "slot_spins_win_non_negative" CHECK ("slot_spins"."win_credits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "prize_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prize_game_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"server_seed_hash" varchar(64) NOT NULL,
	"server_seed" varchar(128),
	"outcome" jsonb NOT NULL,
	"reward_credits" bigint DEFAULT 0 NOT NULL,
	"reward_item_id" uuid,
	"ledger_entry_id" uuid,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prize_claims_reward_non_negative" CHECK ("prize_claims"."reward_credits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "prize_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"kind" "prize_game_kind" NOT NULL,
	"name" varchar(60) NOT NULL,
	"world_position" jsonb NOT NULL,
	"activation_radius" integer DEFAULT 3 NOT NULL,
	"config" jsonb NOT NULL,
	"cooldown_seconds" integer DEFAULT 3600 NOT NULL,
	"schedule_cron" varchar(64),
	"jackpot_credits" bigint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prize_games_cooldown_non_negative" CHECK ("prize_games"."cooldown_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "chat_scope" NOT NULL,
	"room_id" uuid,
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid,
	"body" varchar(240) NOT NULL,
	"original_body" varchar(240),
	"was_filtered" boolean DEFAULT false NOT NULL,
	"moderation_state" "moderation_state" DEFAULT 'ok' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_scope_targets" CHECK (("chat_messages"."scope" = 'global' and "chat_messages"."room_id" is null and "chat_messages"."recipient_id" is null)
        or ("chat_messages"."scope" = 'room' and "chat_messages"."room_id" is not null)
        or ("chat_messages"."scope" = 'private' and "chat_messages"."recipient_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" "report_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" "report_reason" NOT NULL,
	"details" varchar(1000),
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"handled_by_id" uuid,
	"handled_at" timestamp with time zone,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_users_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wardrobe_sets" ADD CONSTRAINT "wardrobe_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_inventory" ADD CONSTRAINT "user_inventory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_inventory" ADD CONSTRAINT "user_inventory_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_inventory" ADD CONSTRAINT "user_inventory_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bingo_cards" ADD CONSTRAINT "bingo_cards_game_id_bingo_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."bingo_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bingo_cards" ADD CONSTRAINT "bingo_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bingo_cards" ADD CONSTRAINT "bingo_cards_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bingo_configs" ADD CONSTRAINT "bingo_configs_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bingo_games" ADD CONSTRAINT "bingo_games_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_machines" ADD CONSTRAINT "slot_machines_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_machines" ADD CONSTRAINT "slot_machines_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_spins" ADD CONSTRAINT "slot_spins_machine_id_slot_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."slot_machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_spins" ADD CONSTRAINT "slot_spins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_spins" ADD CONSTRAINT "slot_spins_bet_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("bet_ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_spins" ADD CONSTRAINT "slot_spins_win_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("win_ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_claims" ADD CONSTRAINT "prize_claims_prize_game_id_prize_games_id_fk" FOREIGN KEY ("prize_game_id") REFERENCES "public"."prize_games"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_claims" ADD CONSTRAINT "prize_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_claims" ADD CONSTRAINT "prize_claims_reward_item_id_items_id_fk" FOREIGN KEY ("reward_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prize_claims" ADD CONSTRAINT "prize_claims_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_id_users_id_fk" FOREIGN KEY ("handled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_unique" ON "auth_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_family_idx" ON "auth_sessions" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "avatars_user_unique" ON "avatars" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_pair_unique" ON "friendships" USING btree ("requester_id","addressee_id");--> statement-breakpoint
CREATE INDEX "friendships_addressee_idx" ON "friendships" USING btree ("addressee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_display_name_unique" ON "users" USING btree (lower("display_name"));--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "wardrobe_sets_user_name_unique" ON "wardrobe_sets" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "items_code_unique" ON "items" USING btree ("code");--> statement-breakpoint
CREATE INDEX "items_category_rarity_idx" ON "items" USING btree ("category","rarity");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_idempotency_unique" ON "ledger_entries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_wallet_sequence_unique" ON "ledger_entries" USING btree ("wallet_id","sequence");--> statement-breakpoint
CREATE INDEX "ledger_entries_user_created_idx" ON "ledger_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_ref_idx" ON "ledger_entries" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_inventory_user_item_unique" ON "user_inventory" USING btree ("user_id","item_id");--> statement-breakpoint
CREATE INDEX "user_inventory_user_idx" ON "user_inventory" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_user_unique" ON "wallets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bingo_cards_game_user_index_unique" ON "bingo_cards" USING btree ("game_id","user_id","card_index");--> statement-breakpoint
CREATE INDEX "bingo_cards_game_idx" ON "bingo_cards" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "bingo_cards_user_idx" ON "bingo_cards" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bingo_configs_room_unique" ON "bingo_configs" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "bingo_games_room_created_idx" ON "bingo_games" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "bingo_games_status_idx" ON "bingo_games" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_slug_unique" ON "rooms" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "rooms_owner_idx" ON "rooms" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "rooms_browse_idx" ON "rooms" USING btree ("kind","status","visibility");--> statement-breakpoint
CREATE INDEX "slot_machines_owner_idx" ON "slot_machines" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "slot_machines_status_idx" ON "slot_machines" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "slot_spins_machine_nonce_unique" ON "slot_spins" USING btree ("machine_id","nonce");--> statement-breakpoint
CREATE INDEX "slot_spins_user_created_idx" ON "slot_spins" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "slot_spins_big_wins_idx" ON "slot_spins" USING btree ("win_credits");--> statement-breakpoint
CREATE INDEX "prize_claims_cooldown_idx" ON "prize_claims" USING btree ("prize_game_id","user_id","claimed_at");--> statement-breakpoint
CREATE INDEX "prize_claims_user_idx" ON "prize_claims" USING btree ("user_id","claimed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prize_games_code_unique" ON "prize_games" USING btree ("code");--> statement-breakpoint
CREATE INDEX "prize_games_active_idx" ON "prize_games" USING btree ("active");--> statement-breakpoint
CREATE INDEX "chat_messages_room_created_idx" ON "chat_messages" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_sender_idx" ON "chat_messages" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_dm_idx" ON "chat_messages" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_id");