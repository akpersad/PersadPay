-- 0044 — date-effective IRS standard mileage rates
--
-- tax_rates is keyed on effective_year, which cannot represent a mid-year rate
-- change. The IRS made exactly that change in 2026: Notice 2026-10 set the
-- business rate at 72.5c/mi from Jan 1, then Announcement 2026-11 (IRB 2026-29,
-- p. 49) raised it to 76c/mi effective Jul 1, 2026 "for transportation expenses
-- paid or incurred ... on or after July 1, 2026".
--
-- Mileage is reimbursed under an accountable plan and is non-taxable, so a
-- stale rate causes no tax error — it under-reimburses the employee. Still
-- wrong on its face, and the split-year shape will recur.
--
-- tax_rates.irs_mileage_rate is left in place (still NOT NULL) as the
-- January-effective rate for that year, but all reimbursement math now reads
-- this table via getMileageRateForDate(). Keep the two consistent: the row
-- here with effective_from = YYYY-01-01 should match tax_rates for YYYY.

create table public.irs_mileage_rates (
  effective_from date primary key,
  rate           numeric(6,4) not null,
  source_notes   text,
  created_at     timestamptz not null default now()
);

comment on table public.irs_mileage_rates is
  'IRS optional standard mileage rate for business use, keyed on the date the rate takes effect. Supports mid-year changes. Verify each December and on any IRS announcement.';

create index irs_mileage_rates_effective_idx
  on public.irs_mileage_rates (effective_from desc);

alter table public.irs_mileage_rates enable row level security;

-- Mirrors tax_rates: admins full, employees read-only (stub display math).
create policy "Admins full access to irs_mileage_rates" on public.irs_mileage_rates
  for all using (public.is_admin());
create policy "Employees read irs_mileage_rates" on public.irs_mileage_rates
  for select using (not public.is_admin());

-- Read-only to authenticated, like tax_rates: updated only via migrations.
grant select on public.irs_mileage_rates to authenticated;
grant select, insert, update, delete on public.irs_mileage_rates to service_role;

insert into public.irs_mileage_rates (effective_from, rate, source_notes) values
  ('2025-01-01', 0.7000,
   'IRS Notice 2025-05 — 70.0c/mi business rate for calendar 2025.'),
  ('2026-01-01', 0.7250,
   'IRS Notice 2026-10 (issued 2025-12-29, IR-2025-128) — 72.5c/mi business rate effective Jan 1, 2026.'),
  ('2026-07-01', 0.7600,
   'IRS Announcement 2026-11, IRB 2026-29 p.49 (issued 2026-07-13) — modifies Notice 2026-10, raising the business rate to 76.0c/mi effective Jul 1, 2026 (medical/moving 23.5c). Verified 2026-08-24 against the IRB PDF.')
on conflict (effective_from) do nothing;
