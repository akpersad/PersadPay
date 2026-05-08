-- Phase 13.4 — Day-of-rest acknowledgement (NY Labor Law § 161)
-- Phase 13.5 — Workplace posters checklist (NY DOL required posters)

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
    'sexual_harassment_training_certificate',
    'day_of_rest_acknowledgement',
    'posters_bundle'
  ));

-- After 0020, harassment items are at 9 and 10; File New Hire Report is at 11.
-- Insert day-of-rest (11) and posters (12) before new-hire report, shifting 11+ up by 2.
update public.onboarding_checklist
  set sort_order = sort_order + 2
  where sort_order >= 11;

insert into public.onboarding_checklist (label, detail, sort_order) values (
  'Acknowledge NY Day of Rest rule (§ 161)',
  'NY Labor Law § 161 mandates 24 consecutive hours off per calendar week for domestic workers. If she voluntarily works that day, the entire day is paid at 1.5×. Have both parties sign a one-paragraph acknowledgement and retain for the duration of employment.',
  11
);

insert into public.onboarding_checklist (label, detail, sort_order) values (
  'Print and post required workplace posters',
  'Place all in a binder or kitchen/work area where employee can read: (1) NYS Domestic Workers Bill of Rights — https://dol.ny.gov/system/files/documents/2021/03/p715-english.pdf (2) NYS Sexual Harassment Prevention Notice — https://www.ny.gov/sites/default/files/atoms/files/SexualHarassmentNoticeofRights.pdf (3) NYS Minimum Wage Information (4) Federal FLSA Your Rights (WH-1088) — https://www.dol.gov/agencies/whd/posters (5) Federal EEO / USERRA / Polygraph Protection. Source: https://dol.ny.gov/required-workplace-posters',
  12
);
