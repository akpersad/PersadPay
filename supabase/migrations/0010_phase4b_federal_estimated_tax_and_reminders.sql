-- Phase 4b — Federal estimated tax + reminders + onboarding additions
-- Source: /docs/ROADMAP.md Phase 4b
--
-- 1. Extend filings.filing_type to include 'Federal Estimated Tax' so the
--    1040-ES quarterly remittances can be tracked alongside NYS-45 and
--    Schedule H.
-- 2. Update the quarter-consistency check: Federal Estimated Tax also has
--    a quarter (1-4), like NYS-45.
-- 3. Seed Federal Estimated Tax reminders for 2026 (1040-ES due dates:
--    Apr 15 / Jun 15 / Sep 15 of the tax year, Jan 15 of the year after).
-- 4. Seed an early-Feb 2027 SUTA rate verification reminder (NY DOL mails
--    new rate notices in Feb-Mar each year).
-- 5. Add a Workers' Comp recommended note to the onboarding checklist —
--    not required at <40 hrs/wk live-out per WCB rule, but every
--    household-payroll service we cross-checked recommends voluntary
--    coverage anyway.

-- ── 1. filings.filing_type — add 'Federal Estimated Tax' ───────────────────
alter table public.filings drop constraint if exists filings_filing_type_check;
alter table public.filings
  add constraint filings_filing_type_check
  check (filing_type in ('NYS-45', 'Schedule H', 'Federal Estimated Tax'));

-- ── 2. quarter consistency — Federal Estimated Tax must have a quarter ────
alter table public.filings drop constraint if exists filings_quarter_consistency;
alter table public.filings
  add constraint filings_quarter_consistency
  check (
    (filing_type = 'Schedule H' and quarter is null) or
    (filing_type in ('NYS-45', 'Federal Estimated Tax') and quarter is not null)
  );

-- ── 3. Federal Estimated Tax reminders for 2026 ───────────────────────────
-- Title carries the year so the dismiss-and-roll-forward logic in
-- RemindersView increments correctly each year.
insert into public.reminders (title, due_date, description) values
  ('Federal Estimated Tax Q1 2026', '2026-04-15',
   'Form 1040-ES Q1 estimated payment to IRS. Covers Jan–Mar wages. ~1/4 of projected annual Schedule H liability (FICA combined + FUTA + federal withholding). Pay via EFTPS or IRS Direct Pay.'),
  ('Federal Estimated Tax Q2 2026', '2026-06-15',
   'Form 1040-ES Q2 estimated payment to IRS. Covers Apr–May wages. ~1/4 of projected annual Schedule H liability. Pay via EFTPS or IRS Direct Pay.'),
  ('Federal Estimated Tax Q3 2026', '2026-09-15',
   'Form 1040-ES Q3 estimated payment to IRS. Covers Jun–Aug wages. ~1/4 of projected annual Schedule H liability. Pay via EFTPS or IRS Direct Pay.'),
  ('Federal Estimated Tax Q4 2026', '2027-01-15',
   'Form 1040-ES Q4 estimated payment to IRS. Covers Sep–Dec wages. ~1/4 of projected annual Schedule H liability. Pay via EFTPS or IRS Direct Pay.');

-- ── 4. SUTA rate verification reminder (early Feb 2027) ────────────────────
insert into public.reminders (title, due_date, description) values
  ('Verify 2027 NY SUTA rate', '2027-02-15',
   'NY DOL mails new annual SUTA rate notices in Feb–Mar. Once your 2027 rate notice arrives, update settings.suta_rate to match. Tracked separately from the December tax_rates verification because the rate notice arrives later.');

-- ── 4b. W-2 / W-3 year-end transmittal reminder ────────────────────────────
insert into public.reminders (title, due_date, description) values
  ('W-2 / W-3 to employee + SSA 2026', '2027-01-31',
   'Furnish W-2 to babysitter by Jan 31, 2027. File W-2 Copy A + W-3 transmittal to SSA via Business Services Online (https://www.ssa.gov/bso/bsowelcome.htm) or paper by Jan 31, 2027.');

-- ── 5. Workers' Comp recommended note in onboarding ────────────────────────
insert into public.onboarding_checklist (label, detail, completed, sort_order)
select
  'Consider voluntary Workers'' Comp policy (recommended, not required)',
  'NY Workers'' Comp is NOT required at <40 hrs/wk live-out per WCB rule, but every household-payroll service (HomePay, GTM, HWS) recommends voluntary coverage in case of an on-the-job injury. Quote available through NYSIF (https://www.nysif.com) or any private carrier. This is a recommendation, not a mandate.',
  false,
  coalesce((select max(sort_order) from public.onboarding_checklist), 0) + 1;
