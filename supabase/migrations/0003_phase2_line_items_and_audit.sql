-- Phase 2 — Additional pay line items + audit log
-- Source: /docs/ROADMAP.md Phase 2
--
-- 1. paystub_line_items: per-stub additions (bonus, mileage reimbursement,
--    holiday pay, etc.) with separate flags for federal income, FICA, NY state,
--    and W-2 Box 1 taxability per IRS Pub 926 / Pub 15-B classification.
-- 2. audit_log + generic trigger function attached to paystubs, settings,
--    paystub_line_items, w2s. Captures actor, action, before/after JSON.

-- ── 1. paystub_line_items ───────────────────────────────────────────────────
create table public.paystub_line_items (
  id            uuid primary key default uuid_generate_v4(),
  paystub_id    uuid not null references public.paystubs(id) on delete cascade,
  line_type     text not null,
  label         text not null,
  amount        numeric(10,2) not null,
  -- Tax flags. Default to fully taxable so the safe path is the easy path —
  -- non-taxable items must be deliberately selected by the admin.
  taxable_fed   boolean not null default true,
  taxable_fica  boolean not null default true,
  taxable_ny    boolean not null default true,
  w2_box1       boolean not null default true,
  -- Some items (third-party tips) are recorded for the employer's record but
  -- do not flow into wages, deductions, or W-2 reporting.
  informational_only boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index paystub_line_items_paystub_id_idx on public.paystub_line_items (paystub_id);

alter table public.paystub_line_items enable row level security;

create policy "Admins full access to paystub_line_items"
  on public.paystub_line_items for all using (public.is_admin());

create policy "Employees read own stub line items"
  on public.paystub_line_items for select
  using (
    exists (
      select 1 from public.paystubs p
      where p.id = paystub_line_items.paystub_id
        and p.employee_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.paystub_line_items to authenticated;

-- ── 2. audit_log ────────────────────────────────────────────────────────────
-- Permanent forensic record. Inserts come exclusively from the trigger
-- function below; the app never writes here directly.
create table public.audit_log (
  id          uuid primary key default uuid_generate_v4(),
  table_name  text not null,
  record_id   uuid,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id    uuid references public.profiles(id),
  before_data jsonb,
  after_data  jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_table_record_idx on public.audit_log (table_name, record_id);
create index audit_log_created_at_idx   on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

create policy "Admins read audit_log" on public.audit_log
  for select using (public.is_admin());

-- No insert/update/delete policies — only the trigger function writes here.

grant select on public.audit_log to authenticated;
grant insert on public.audit_log to authenticated;

-- ── 3. Generic audit trigger function ───────────────────────────────────────
-- One function reused by every audited table. Captures the auth.uid() of the
-- current request when available (null for service_role / migrations).
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  -- auth.uid() is only meaningful inside an authenticated request. Suppress
  -- errors for service-role / SQL-editor calls so triggers don't break those.
  begin
    uid := auth.uid();
  exception when others then
    uid := null;
  end;

  if (TG_OP = 'DELETE') then
    insert into public.audit_log (table_name, record_id, action, actor_id, before_data)
    values (TG_TABLE_NAME, OLD.id, TG_OP, uid, to_jsonb(OLD));
    return OLD;
  elsif (TG_OP = 'UPDATE') then
    insert into public.audit_log (table_name, record_id, action, actor_id, before_data, after_data)
    values (TG_TABLE_NAME, NEW.id, TG_OP, uid, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif (TG_OP = 'INSERT') then
    insert into public.audit_log (table_name, record_id, action, actor_id, after_data)
    values (TG_TABLE_NAME, NEW.id, TG_OP, uid, to_jsonb(NEW));
    return NEW;
  end if;
  return null;
end;
$$;

create trigger paystubs_audit
  after insert or update or delete on public.paystubs
  for each row execute procedure public.audit_trigger();

create trigger paystub_line_items_audit
  after insert or update or delete on public.paystub_line_items
  for each row execute procedure public.audit_trigger();

create trigger settings_audit
  after insert or update or delete on public.settings
  for each row execute procedure public.audit_trigger();

create trigger w2s_audit
  after insert or update or delete on public.w2s
  for each row execute procedure public.audit_trigger();
