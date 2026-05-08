-- Phase 13.3 — W-2 missing fields
-- Adds settings columns required to generate a legally complete W-2 PDF:
--   employee name split (first / middle initial / last) for Box e,
--   employee address for Box f, and employer NY state ID for Box 15.
-- Decision: SSN is never stored in the app (Box a is a hand-write blank on the PDF).

alter table public.settings
  add column if not exists employee_name_first text,
  add column if not exists employee_name_middle_initial text,
  add column if not exists employee_name_last text,
  add column if not exists employee_address text,
  add column if not exists employer_ny_state_id text;
