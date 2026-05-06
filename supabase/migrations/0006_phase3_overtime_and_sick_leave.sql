-- Phase 3 — Overtime + sick leave tracking
-- Source: /docs/ROADMAP.md Phase 3
--
-- 1. overtime_hours: how many of the stub's hours are at the OT rate.
--    NY Domestic Workers Bill of Rights (Labor Law Art. 19, § 170) requires
--    1.5× after 40 hrs/week for non-residential domestic workers — never
--    triggered at 9 hrs/week, but the system must support it.
-- 2. reason: nullable, primarily for zero-hour weeks (week off, sick — unpaid,
--    vacation, holiday) so the sick-leave summary can count days.
-- 3. sick_hours: hours the employee was sick this period. Sums across the
--    year drive the on-demand sick-leave summary required by NY Labor Law
--    § 196-b(4) — written summary of sick leave used within 3 business days
--    of an employee request.

alter table public.paystubs
  add column if not exists overtime_hours numeric(6,2) not null default 0,
  add column if not exists sick_hours     numeric(6,2) not null default 0,
  add column if not exists reason         text;

-- Ensure OT hours don't exceed total hours.
alter table public.paystubs
  drop constraint if exists paystubs_overtime_within_total;
alter table public.paystubs
  add constraint paystubs_overtime_within_total
  check (overtime_hours >= 0 and overtime_hours <= hours_worked);

-- Constrain reason to known values (or null).
alter table public.paystubs
  drop constraint if exists paystubs_reason_known;
alter table public.paystubs
  add constraint paystubs_reason_known
  check (reason is null or reason in ('week_off', 'sick_unpaid', 'vacation_unpaid', 'holiday_unpaid', 'other'));
