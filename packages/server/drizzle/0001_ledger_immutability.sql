-- Ledger immutability.
--
-- The application posts every credit movement through services/ledger.ts, but
-- "the application is careful" is not a guarantee. These triggers make the
-- database itself refuse to rewrite financial history: a stray UPDATE, a bad
-- migration or a console session cannot alter or remove a posted entry.
--
-- Corrections are made the way real ledgers make them: by posting a
-- compensating entry with reason 'admin_adjustment'.

CREATE OR REPLACE FUNCTION ledger_entries_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'ledger_entries is append-only: % is not permitted. Post a compensating entry instead.',
    TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_update
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_truncate
  BEFORE TRUNCATE ON ledger_entries
  FOR STATEMENT EXECUTE FUNCTION ledger_entries_reject_mutation();
--> statement-breakpoint
-- Slot machines may only be published once the server has actually computed
-- their theoretical RTP. The CHECK constraint in the schema covers the allowed
-- range; this covers "was it ever computed at all", which a NULL would
-- otherwise slip past on the status transition.
CREATE OR REPLACE FUNCTION slot_machines_require_rtp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'published' AND (NEW.rtp_theoretical IS NULL OR NEW.rtp_computed_at IS NULL) THEN
    RAISE EXCEPTION 'A slot machine cannot be published before its RTP has been computed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER slot_machines_rtp_guard
  BEFORE INSERT OR UPDATE ON slot_machines
  FOR EACH ROW EXECUTE FUNCTION slot_machines_require_rtp();
