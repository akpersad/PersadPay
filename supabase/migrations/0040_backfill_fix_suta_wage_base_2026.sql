-- BACKFILL of remote migration `fix_suta_wage_base_2026` (version
-- 20260509212753, applied to prod 2026-05-09 via MCP apply_migration; no
-- local file existed until the 2026-07-18 audit flagged the gap). Content is
-- verbatim from supabase_migrations.schema_migrations. Idempotent — safe on
-- both a fresh replay and the already-migrated prod database.

UPDATE tax_rates
SET
  suta_wage_base = 17600,
  source_notes = 'Verified 2026-05-05 (updated 2026-05-09). Sources: IRS Topic 751 (FICA, SS wage base); IRS Pub 926 (FUTA); NY DOL NYS-50 publication (SUTA wage base $17,600 for NY 2026 — formula change: 18% of state average annual wage, permanent from 2026); NY DFS 2026 PFL rate decision (PFL rate 0.432%, cap $411.91); NY DFS / WCB (SDI 0.5% / $0.60 weekly cap); IRS Notice 2026-10 (mileage 72.5¢/mi). See /docs/ROADMAP.md.'
WHERE effective_year = 2026;
