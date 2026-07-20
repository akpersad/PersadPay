-- BACKFILL of remote migration `phase2_audit_fixes` (version 20260510000717,
-- applied to prod 2026-05-10 via MCP apply_migration; no local file existed
-- until the 2026-07-18 audit flagged the gap). Content is verbatim from
-- supabase_migrations.schema_migrations. Idempotent — safe on both a fresh
-- replay and the already-migrated prod database.

-- Phase 2 audit fixes (AUDIT_WORK_PLAN.md)

-- B6a: Add rsf_rate to tax_rates (NY Re-employment Service Fund surcharge)
--      Rate 0.075% is statutory; verify annually from NY DOL RSF notice.
alter table public.tax_rates
  add column if not exists rsf_rate numeric not null default 0.00075;

update public.tax_rates
  set rsf_rate = 0.00075
  where effective_year = 2026;

-- 13c: Tighten over-broad grants on admin-only tables
-- settings is a single-row table; authenticated never needs INSERT/DELETE
revoke insert, delete on public.settings from authenticated;
-- onboarding_checklist items are pre-seeded via migrations; only UPDATE needed
revoke insert, delete on public.onboarding_checklist from authenticated;
-- tax_rates is read-only from the UI; updated only via migrations
revoke insert, update, delete on public.tax_rates from authenticated;

-- 12g: W-4 clarification — voluntary for household employees
update public.onboarding_checklist
  set detail = 'Federal income tax withholding is voluntary for household employees (IRS Pub 926). Obtain a signed W-4 before setting a withholding amount in Settings — without a signed form, keep federal_withholding_per_period at $0.'
  where label = 'Have employee complete Federal W-4';

-- 12d: IT-2104-E note — employee may qualify for full exemption
update public.onboarding_checklist
  set detail = 'NY state withholding is voluntary for household employees (NY DTF guidance). Obtain a signed IT-2104 before setting a withholding amount in Settings. If she claims full NY tax exemption (low income), she files IT-2104-E instead — withhold $0 for NY state in that case.'
  where label = 'Have employee complete NY IT-2104';

-- 12e: LS-59 — updated DOL URL (labor.ny.gov → dol.ny.gov)
update public.onboarding_checklist
  set detail = 'NY Labor Law § 195(1) (WTPA) requires a written wage notice at hire and with any change. Use form LS-59 (household employers, available at https://dol.ny.gov/form-ls-59-exempt-employees). Sign two copies — give one to employee, retain one for 6 years.'
  where label = 'Provide signed LS-59 Wage Notice to employee';
