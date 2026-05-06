-- Phase 4a — Signed document storage + W-4/IT-2104 capture
-- Source: /docs/ROADMAP.md Phase 4
--
-- 1. signed_documents: tracks uploaded redundancy copies of signed legal/HR
--    docs. The physical originals live in the user's home fire-safe; this
--    table + Supabase Storage bucket are a *secondary* backup, not the
--    system of record. One row per document_type so re-upload replaces.
-- 2. signed-documents Storage bucket (private, admin-only RLS).
-- 3. withholding_forms: captures W-4 and IT-2104 form values + the
--    per-period dollar amount the admin computed via the IRS estimator
--    (W-4) or Pub NYS-50-T (IT-2104). settings.federal_withholding_per_period
--    and settings.state_withholding_per_period remain the source of truth
--    for the tax engine; this table is the auditable record of how those
--    numbers were derived.

-- ── 1. signed_documents ────────────────────────────────────────────────────
create table public.signed_documents (
  id              uuid primary key default uuid_generate_v4(),
  document_type   text not null unique check (
    document_type in ('sick_leave_policy', 'sick_leave_summary', 'ls59', 'pfl_waiver', 'w4', 'it2104')
  ),
  file_path       text not null,            -- key within the signed-documents bucket
  file_name       text,                     -- original filename for display
  file_size_bytes integer,
  mime_type       text,
  uploaded_at     timestamptz not null default now(),
  uploaded_by     uuid references public.profiles(id),
  notes           text
);

alter table public.signed_documents enable row level security;

create policy "Admins full access to signed_documents"
  on public.signed_documents for all using (public.is_admin());

grant select, insert, update, delete on public.signed_documents to authenticated;

create trigger signed_documents_audit
  after insert or update or delete on public.signed_documents
  for each row execute procedure public.audit_trigger();

-- ── 2. Storage bucket + object RLS ─────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('signed-documents', 'signed-documents', false)
on conflict (id) do nothing;

drop policy if exists "Admins read signed-documents objects" on storage.objects;
drop policy if exists "Admins write signed-documents objects" on storage.objects;
drop policy if exists "Admins update signed-documents objects" on storage.objects;
drop policy if exists "Admins delete signed-documents objects" on storage.objects;

create policy "Admins read signed-documents objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'signed-documents' and public.is_admin());

create policy "Admins write signed-documents objects"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'signed-documents' and public.is_admin());

create policy "Admins update signed-documents objects"
  on storage.objects for update to authenticated
  using (bucket_id = 'signed-documents' and public.is_admin());

create policy "Admins delete signed-documents objects"
  on storage.objects for delete to authenticated
  using (bucket_id = 'signed-documents' and public.is_admin());

-- ── 3. withholding_forms ───────────────────────────────────────────────────
create table public.withholding_forms (
  id                       uuid primary key default uuid_generate_v4(),
  form_type                text not null unique check (form_type in ('W-4', 'IT-2104')),
  form_values              jsonb not null default '{}'::jsonb,
  computed_amount          numeric(10,2) not null default 0,
  computed_against_gross   numeric(10,2),
  computed_at              timestamptz,
  updated_by               uuid references public.profiles(id),
  updated_at               timestamptz not null default now(),
  notes                    text
);

alter table public.withholding_forms enable row level security;

create policy "Admins full access to withholding_forms"
  on public.withholding_forms for all using (public.is_admin());

grant select, insert, update, delete on public.withholding_forms to authenticated;

create trigger withholding_forms_audit
  after insert or update or delete on public.withholding_forms
  for each row execute procedure public.audit_trigger();
