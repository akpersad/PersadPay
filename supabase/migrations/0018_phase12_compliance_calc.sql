-- Phase 12 — Calculation Correctness & Data Integrity
--
-- 12.1: Stop SDI deduction (default off) — add dbl_covered to settings + paystubs snapshot
-- 12.2: Stop PFL deduction — replace pfl_waived (deduct unless waived) with
--       pfl_covered (deduct only if covered). Default false. Semantics inverted.
-- 12.3: FICA/FUTA household thresholds moved from code constants into tax_rates table
-- 12.4: Stub snapshot fields — suta_rate_at_generation, dbl_covered_at_generation,
--       pfl_covered_at_generation — so edit mode reads stored values, not live settings
-- 12.5: View paystubs_with_tax_year adds composite ordering key for correct YTD queries
--
-- Rollback path: restore pfl_waived column, drop pfl_covered, drop dbl_covered,
-- drop *_at_generation columns from paystubs, drop threshold columns from tax_rates.

-- ── 12.1 Settings: DBL coverage toggle ─────────────────────────────────────────
alter table public.settings
  add column if not exists dbl_covered boolean not null default false;

-- ── 12.2 Settings: replace pfl_waived with pfl_covered (inverted semantics) ────
-- Add pfl_covered column (covered=true means deduct PFL; default false = not covered)
alter table public.settings
  add column if not exists pfl_covered boolean not null default false;

-- Migrate existing data: where pfl_waived was false (deducting PFL), set pfl_covered = true
-- pfl_covered = NOT pfl_waived
update public.settings set pfl_covered = not pfl_waived;

-- Drop the old pfl_waived column
alter table public.settings drop column if exists pfl_waived;

-- ── 12.1/12.2/12.4 Paystubs: add generation-time snapshot columns ───────────────
alter table public.paystubs
  add column if not exists dbl_covered_at_generation boolean not null default false;

alter table public.paystubs
  add column if not exists pfl_covered_at_generation boolean not null default false;

-- Nullable: NULL means stub was created before Phase 12 (treat as settings SUTA rate)
alter table public.paystubs
  add column if not exists suta_rate_at_generation numeric(6,4);

-- ── 12.3 tax_rates: add FICA/FUTA household threshold columns ───────────────────
alter table public.tax_rates
  add column if not exists fica_household_threshold numeric(10,2) not null default 0;

alter table public.tax_rates
  add column if not exists futa_quarterly_threshold numeric(10,2) not null default 0;

-- Seed 2026 thresholds (IRS Pub 926, Table 1, p.4)
update public.tax_rates
  set fica_household_threshold = 3000,
      futa_quarterly_threshold = 1000
  where effective_year = 2026;

-- Seed 2025 thresholds if that row exists
update public.tax_rates
  set fica_household_threshold = 2800,
      futa_quarterly_threshold = 1000
  where effective_year = 2025;

-- ── 12.2 Onboarding checklist: update PFL waiver item to match new coverage model ─
update public.onboarding_checklist
  set detail = 'Document the schedule analysis (one-page memo: hours per week × days per year). She works <20 hrs/wk AND <175 days/52 wks, so PFL coverage does not apply — the PFL deduction is off by default in Settings. Optional belt-and-suspenders: have her sign the PFL waiver form at https://www.wcb.ny.gov/content/main/forms/PFLWaiver.pdf and retain it.'
  where label ilike '%pfl%waiver%' or label ilike '%pfl-waiver%';

-- ── 12.5 View: paystubs enriched with tax_year for composite YTD predicate ─────
-- Enables correct "stubs before this one this year" queries that respect both
-- pay_date ordering and stub_number as a tiebreaker for same-day stubs.
create or replace view public.paystubs_with_tax_year as
  select *,
    extract(year from pay_date)::int as tax_year
  from public.paystubs;
