-- Phase 1 — Tax-year versioning + Quarterly filing data
-- Source: /docs/ROADMAP.md Phase 1
--
-- 1. Create tax_rates table keyed on effective_year. Move all constants out
--    of lib/tax.ts so calculateTaxes can pick the row matching pay_date's year.
-- 2. Seed 2026 row with verified values (see docs/ROADMAP.md for sources).
-- 3. Create filings table for tracking NYS-45 quarter and Schedule H year
--    submissions (filed_on date, confirmation number, free-text notes).
-- 4. Add Dec 1 2026 reminder to verify and seed 2027 rates before year rolls.

-- ── 1. tax_rates ────────────────────────────────────────────────────────────
create table public.tax_rates (
  id                  uuid primary key default uuid_generate_v4(),
  effective_year      integer not null unique,
  fica_ss_rate        numeric(8,5)  not null,
  fica_medicare_rate  numeric(8,5)  not null,
  ss_wage_base        numeric(12,2) not null,
  futa_rate           numeric(8,5)  not null,
  futa_wage_base      numeric(12,2) not null,
  suta_wage_base      numeric(12,2) not null,
  sdi_rate            numeric(8,5)  not null,
  sdi_weekly_cap      numeric(8,2)  not null,
  pfl_rate            numeric(8,5)  not null,
  pfl_annual_cap      numeric(10,2) not null,
  irs_mileage_rate    numeric(6,4)  not null,
  source_notes        text,
  created_at          timestamptz   not null default now()
);

create index tax_rates_year_idx on public.tax_rates (effective_year desc);

alter table public.tax_rates enable row level security;

create policy "Admins full access to tax_rates" on public.tax_rates
  for all using (public.is_admin());

grant select, insert, update, delete on public.tax_rates to authenticated;

insert into public.tax_rates (
  effective_year, fica_ss_rate, fica_medicare_rate, ss_wage_base,
  futa_rate, futa_wage_base, suta_wage_base,
  sdi_rate, sdi_weekly_cap, pfl_rate, pfl_annual_cap,
  irs_mileage_rate, source_notes
) values (
  2026, 0.062, 0.0145, 184500,
  0.006, 7000, 13000,
  0.005, 0.60, 0.00432, 411.91,
  0.725,
  'Verified 2026-05-05. Sources: IRS Topic 751 (FICA, SS wage base); IRS Pub 926 (FUTA); NY DOL UI rate notice (SUTA wage base $13,000 for NY 2026); NY DFS 2026 PFL rate decision (PFL rate 0.432%, cap $411.91); NY DFS / WCB (SDI 0.5% / $0.60 weekly cap); IRS Notice 2026-10 (mileage 72.5¢/mi). See /docs/ROADMAP.md.'
);

-- ── 2. filings ──────────────────────────────────────────────────────────────
create table public.filings (
  id            uuid primary key default uuid_generate_v4(),
  filing_type   text not null check (filing_type in ('NYS-45', 'Schedule H')),
  tax_year      integer not null,
  quarter       integer check (quarter is null or quarter between 1 and 4),
  filed_on      date,
  confirmation  text,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  -- NYS-45 must have quarter; Schedule H must not.
  constraint filings_quarter_consistency check (
    (filing_type = 'NYS-45' and quarter is not null) or
    (filing_type = 'Schedule H' and quarter is null)
  )
);

-- Unique on (type, year, quarter) — coalesce nulls so Schedule H gets uniqueness too.
create unique index filings_unique
  on public.filings (filing_type, tax_year, coalesce(quarter, 0));

create index filings_year_idx on public.filings (tax_year desc);

alter table public.filings enable row level security;

create policy "Admins full access to filings" on public.filings
  for all using (public.is_admin());

grant select, insert, update, delete on public.filings to authenticated;

-- ── 3. Dec 1 reminder for next year's tax rates ─────────────────────────────
-- Title carries the year (2027) so the existing dismiss-and-roll-forward logic
-- in RemindersView increments it correctly each year.
insert into public.reminders (title, due_date, description) values (
  'Verify 2027 tax rates',
  '2026-12-01',
  'Update the tax_rates table with verified values for the upcoming year: FICA SS wage base, FUTA wage base, NY SUTA wage base, NY SDI rate/cap, NY PFL rate/cap, IRS standard mileage rate. Cite primary sources (IRS, NY DOL, NY DFS) in the migration commit message. See /docs/ROADMAP.md.'
);
