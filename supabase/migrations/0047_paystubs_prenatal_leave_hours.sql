-- 0047 — NY Paid Prenatal Leave hours per stub
--
-- NY Labor Law § 196-b(4-a), effective 2025-01-01: "every employer shall be
-- required to provide to its employees twenty hours of paid prenatal personal
-- leave". Confirmed applicable to this household employer and to a 9 hr/wk
-- part-time employee — NY DOL Form P695 states verbatim under NO MINIMUM WORK
-- REQUIREMENT: "You do not need to work a minimum number of hours to earn
-- access to Paid Prenatal Leave ... Newly hired employees are entitled to 20
-- hours of paid prenatal leave as soon as they are hired."
--
-- Deliberately a SEPARATE column from hours_worked, not folded into it:
--   * Paid leave is not "hours worked", so it must not push the week over the
--     40-hour NY overtime threshold.
--   * It must not count toward the DBL/PFL 20-hrs-per-week coverage test in
--     lib/coverage.ts, which reads hours_worked / daily_hours.
--   * It must not count toward sick-leave accrual (NY DOL: employees are
--     "credited with leave time for hours worked and not for hours spent using
--     sick leave"), which generalises to other paid leave.
--
-- It IS wages: paid at the regular rate, so it belongs in gross_pay and is
-- subject to FICA, federal/NY withholding, and W-2 Box 1. gross_pay already
-- includes it (computed at generation), so no backfill of tax columns is needed.
--
-- Entitlement is 20 hours per ROLLING 52-week period measured from first use,
-- NOT per calendar year, and unused hours do not carry over. That window logic
-- lives in src/lib/prenatal.ts; this column only records hours taken.

alter table public.paystubs
  add column if not exists prenatal_leave_hours numeric(6,2) not null default 0;

comment on column public.paystubs.prenatal_leave_hours is
  'NY Paid Prenatal Leave hours taken in this pay period (Labor Law § 196-b(4-a)). PAID at the regular rate and included in gross_pay, unlike sick_hours which is unpaid. Not "hours worked": excluded from the overtime threshold and from the DBL/PFL coverage test. 20 hours per rolling 52-week period from first use.';

alter table public.paystubs
  add constraint paystubs_prenatal_leave_hours_nonneg
  check (prenatal_leave_hours >= 0);
