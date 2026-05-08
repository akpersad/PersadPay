-- Phase 13.1 — Form I-9 compliance
-- Adds 'i9' to signed_documents document_type constraint and inserts onboarding row.
-- I-9 must be completed on/before the employee's first day of work (8 USC § 1324a).

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
    'i9'
  ));

-- Shift items at sort_order >= 4 up by 1 to make room for I-9 before W-4.
update public.onboarding_checklist
  set sort_order = sort_order + 1
  where sort_order >= 4;

insert into public.onboarding_checklist (label, detail, sort_order) values (
  'Complete USCIS Form I-9 (Employment Eligibility Verification)',
  'Required for every U.S. employee. Section 1: employee fills on or before first day of work. Section 2: you fill within 3 business days after examining her ID documents (List A alone, OR List B + List C). Do NOT mail this anywhere — retain in your files. Keep for 3 years from hire OR 1 year after termination, whichever is later. Form: https://www.uscis.gov/i-9',
  4
);
