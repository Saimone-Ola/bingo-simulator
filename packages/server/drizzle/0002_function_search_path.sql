-- Pin the search_path of the guard functions.
--
-- A function without an explicit search_path resolves its names against
-- whatever the calling role happens to have set. For a trigger that exists to
-- refuse tampering with the ledger, resolving anything at the caller's
-- discretion is the wrong default: it is the one function in the schema that a
-- caller has a motive to subvert.
--
-- Neither function references a table, so pinning costs nothing and closes the
-- Supabase linter's `function_search_path_mutable` finding.
ALTER FUNCTION ledger_entries_reject_mutation() SET search_path = pg_catalog, public;--> statement-breakpoint
ALTER FUNCTION slot_machines_require_rtp() SET search_path = pg_catalog, public;
