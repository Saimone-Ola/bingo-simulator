-- Additive durable accounting for the Colyseus halls. Existing room/config and
-- ledger rows are preserved. Run through the Drizzle migrator on a direct URL.
CREATE TABLE "bingo_rounds" (
  "id" uuid PRIMARY KEY NOT NULL,
  "room_code" varchar(18) NOT NULL,
  "config_snapshot" jsonb NOT NULL,
  "seed_hash" varchar(64) NOT NULL,
  "status" varchar(16) DEFAULT 'open' NOT NULL,
  "cards_sold" integer DEFAULT 0 NOT NULL,
  "pot_credits" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "closed_at" timestamptz,
  CONSTRAINT "bingo_rounds_status_valid" CHECK ("status" in ('open', 'finished', 'cancelled')),
  CONSTRAINT "bingo_rounds_totals_non_negative" CHECK ("cards_sold" >= 0 and "pot_credits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bingo_purchases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL REFERENCES "bingo_rounds"("id") ON DELETE restrict,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "request_id" varchar(80) NOT NULL,
  "marking_mode" varchar(12) NOT NULL,
  "quantity" integer NOT NULL,
  "unit_price" bigint NOT NULL,
  "total_credits" bigint NOT NULL,
  "ledger_entry_id" uuid REFERENCES "ledger_entries"("id") ON DELETE restrict,
  "refund_ledger_entry_id" uuid REFERENCES "ledger_entries"("id") ON DELETE restrict,
  "refunded_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "bingo_purchases_amount_valid" CHECK ("quantity" > 0 and "unit_price" >= 0 and "total_credits" = "quantity"::bigint * "unit_price"),
  CONSTRAINT "bingo_purchases_marking_valid" CHECK ("marking_mode" in ('MANUAL', 'AUTOMATIC')),
  CONSTRAINT "bingo_purchases_debit_required" CHECK ("total_credits" = 0 or "ledger_entry_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "bingo_issued_cards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL REFERENCES "bingo_rounds"("id") ON DELETE restrict,
  "purchase_id" uuid NOT NULL REFERENCES "bingo_purchases"("id") ON DELETE restrict,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "card_id" varchar(160) NOT NULL,
  "card_index" integer NOT NULL,
  "signature" varchar(64) NOT NULL,
  "card" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bingo_awards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL REFERENCES "bingo_rounds"("id") ON DELETE restrict,
  "tier" varchar(12) NOT NULL,
  "draw_index" integer NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "card_id" varchar(160) NOT NULL,
  "amount" bigint NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ledger_entry_id" uuid REFERENCES "ledger_entries"("id") ON DELETE restrict,
  "paid_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "bingo_awards_amount_non_negative" CHECK ("amount" >= 0),
  CONSTRAINT "bingo_awards_draw_valid" CHECK ("draw_index" between 1 and 90),
  CONSTRAINT "bingo_awards_tier_valid" CHECK ("tier" in ('CINQUINA', 'BINGO')),
  CONSTRAINT "bingo_awards_paid_entry_required" CHECK ("paid_at" is null or "amount" = 0 or "ledger_entry_id" is not null)
);
--> statement-breakpoint
CREATE INDEX "bingo_rounds_status_idx" ON "bingo_rounds" ("status");
CREATE UNIQUE INDEX "bingo_purchases_request_unique" ON "bingo_purchases" ("game_id", "user_id", "request_id");
CREATE UNIQUE INDEX "bingo_purchases_game_user_unique" ON "bingo_purchases" ("game_id", "user_id");
CREATE UNIQUE INDEX "bingo_issued_cards_game_id_unique" ON "bingo_issued_cards" ("game_id", "card_id");
CREATE UNIQUE INDEX "bingo_issued_cards_game_signature_unique" ON "bingo_issued_cards" ("game_id", "signature");
CREATE UNIQUE INDEX "bingo_issued_cards_purchase_index_unique" ON "bingo_issued_cards" ("purchase_id", "card_index");
CREATE UNIQUE INDEX "bingo_awards_game_tier_card_unique" ON "bingo_awards" ("game_id", "tier", "card_id");
CREATE INDEX "bingo_awards_pending_idx" ON "bingo_awards" ("paid_at");
