-- Phase 13.2 — Sexual Harassment Prevention compliance
-- NY Labor Law § 201-g requires all employers (including 1-employee households) to adopt
-- a sexual harassment prevention policy and provide annual interactive training.

alter table public.signed_documents
  drop constraint if exists signed_documents_document_type_check;

alter table public.signed_documents
  add constraint signed_documents_document_type_check
  check (document_type in (
    'sick_leave_policy',
    'sick_leave_summary',
    'ls59',
    'pfl_waiver',
    'w4',
    'it2104',
    'ein_confirmation',
    'nys_registration',
    'i9',
    'sexual_harassment_policy',
    'sexual_harassment_training_certificate'
  ));

-- After 0019, Sick Leave Policy is at sort_order 8 and File New Hire Report is at 9.
-- Shift 9+ up by 2 to insert harassment items at 9 and 10.
update public.onboarding_checklist
  set sort_order = sort_order + 2
  where sort_order >= 9;

insert into public.onboarding_checklist (label, detail, sort_order) values (
  'Adopt and distribute Sexual Harassment Prevention Policy',
  'NY Labor Law § 201-g requires all employers (including 1-employee households) to adopt the NYS model policy or a compliant equivalent and distribute it to each employee at hire and annually. Free model policy at https://www.ny.gov/combating-sexual-harassment-workplace. Retain signed acknowledgement.',
  9
);

insert into public.onboarding_checklist (label, detail, sort_order) values (
  'Complete annual interactive harassment-prevention training',
  'Free NYS-provided interactive training at https://www.ny.gov/sexual-harassment-prevention-employees. Complete with employee at hire and every calendar year thereafter. Retain training certificate. Cadence: each calendar year (NY DOL FAQ).',
  10
);

-- Seed annual Sexual Harassment Prevention Training reminder starting Jan 31 2027.
-- The existing dismiss-and-roll-forward pattern auto-creates future years.
insert into public.reminders (title, due_date, description) values (
  'Sexual Harassment Prevention Training due 2027',
  '2027-01-31',
  'Complete annual interactive sexual harassment prevention training with employee. Free NYS training at https://www.ny.gov/sexual-harassment-prevention-employees. Retain certificate. Required annually by NY Labor Law § 201-g (NY DOL FAQ: at least once each calendar year).'
);
