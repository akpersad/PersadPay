-- Add 'ein_confirmation' to the signed_documents document_type check constraint.
-- The IRS CP575 / 147C EIN confirmation letter is a key employer document.

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
    'ein_confirmation'
  ));
