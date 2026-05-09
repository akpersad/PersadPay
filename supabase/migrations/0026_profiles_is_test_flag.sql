-- 0026 — profiles.is_test flag
--
-- Why: the production app expects a single employee. Dev/CI needs a permanent
-- test-employee account to exercise the employee-side flows. With both rows
-- present, the `from('profiles').eq('role','employee').single()` lookup at
-- src/app/(app)/stubs/new/page.tsx errors out, leaving the New Stub form in a
-- "settings incomplete" state. Adding an explicit is_test flag lets the
-- production lookup filter the test row out cleanly. Test admins get the same
-- flag for symmetry, even though no current code path filters admins by it.
--
-- Forward-compatible: a freshly invited real employee defaults to is_test=false
-- and is picked up by the lookup automatically — no further code or settings
-- change required when the babysitter is invited via Supabase Auth.

alter table public.profiles
  add column if not exists is_test boolean not null default false;

-- Flag the existing test rows. Idempotent — re-running this migration is safe.
update public.profiles
  set is_test = true
  where email in ('test-admin@persadpay.com', 'test-employee@persadpay.com');

comment on column public.profiles.is_test is
  'True for dev/CI fixture accounts. The production employee lookup filters these out so test rows can coexist with real users without breaking single-row queries.';
