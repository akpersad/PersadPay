-- BACKFILL of remote migration `filings_amount_paid` (version 20260510001443,
-- applied to prod 2026-05-10 via MCP apply_migration; no local file existed
-- until the 2026-07-18 audit flagged the gap). Content is verbatim from
-- supabase_migrations.schema_migrations. Idempotent — safe on both a fresh
-- replay and the already-migrated prod database.

-- Add amount_paid to filings table for YTD payment tracking and safe-harbor (8g)
-- Stores the computed tax amount at the time of marking a filing as filed.
alter table public.filings
  add column if not exists amount_paid numeric(12,2);
