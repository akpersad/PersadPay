-- Phase 0 — Compliance hot-fix migration
-- Apply via Supabase SQL editor before generating the first paystub.
-- Source: /docs/ROADMAP.md Phase 0
--
-- 1. Add employer_phone to settings (NY § 195(3) paystub requirement)
-- 2. Update onboarding_checklist:
--    - Add LS-59 Wage Notice item
--    - Tighten the PFL waiver item with form name + retention rule

-- ── 1. employer_phone column ────────────────────────────────────────────────
alter table public.settings
  add column if not exists employer_phone text;

-- ── 2a. Add LS-59 Wage Notice onboarding item ──────────────────────────────
-- Insert at sort_order 4.5 conceptually; existing items 4+ will be shifted by +1.
update public.onboarding_checklist
  set sort_order = sort_order + 1
  where sort_order >= 4;

insert into public.onboarding_checklist (label, detail, completed, sort_order)
values (
  'Provide signed LS-59 Wage Notice to employee',
  'NY Labor Law § 195(1) requires a Wage Theft Prevention Act notice at hire (Form LS-59 for hourly employees) in English plus the employee''s primary language. Employee signs; retain copy for 6 years. Form: https://dol.ny.gov/system/files/documents/2022/02/ls59.pdf',
  false,
  4
);

-- ── 2b. Tighten PFL Waiver item ────────────────────────────────────────────
update public.onboarding_checklist
  set
    label = 'Obtain signed PFL-Waiver form (employee <20 hrs/week)',
    detail = 'Employees working a regular schedule of <20 hrs/week AND fewer than 175 days in a 52-week period may waive PFL contributions. Use the official PFL-Waiver form at https://paidfamilyleave.ny.gov/pfl-waiver-form. Retain signed waiver for the entire duration of employment. Waiver auto-revokes if schedule changes — back contributions may be owed retroactively.'
  where label like '%PFL waiver%' or label like '%PFL Waiver%';

-- ── 2c. Sick Leave Policy — print, sign, retain ────────────────────────────
-- Append at end of list (sort_order = current max + 1).
insert into public.onboarding_checklist (label, detail, completed, sort_order)
select
  'Print, sign, and file the Sick Leave Policy',
  'Open Documents → Sick Leave Policy in the app, print it, have both employer and employee sign, and store the signed copy. Recommended: commit a scanned PDF to /docs/signed/sick-leave-policy.pdf in the repo so it''s preserved alongside the source code.',
  false,
  coalesce((select max(sort_order) from public.onboarding_checklist), 0) + 1;
