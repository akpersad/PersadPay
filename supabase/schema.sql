-- Persad Pay — Supabase Schema
-- Run this entire file in the Supabase SQL editor (Dashboard → SQL Editor → New query)
--
-- Purpose: rebuild a fresh database to the same final state produced by applying
-- every migration in supabase/migrations/ (0001–0039) plus the remote-only
-- migrations applied via MCP (fix_suta_wage_base_2026, phase1_schema_additions,
-- phase2_audit_fixes, filings_amount_paid — all 2026-05-09/10). Regenerated
-- 2026-07-18 against the live database catalog.

-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  email       text not null,
  role        text not null check (role in ('admin', 'employee')),
  is_test     boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on column public.profiles.is_test is
  'True for dev/CI fixture accounts. The production employee lookup filters these out so test rows can coexist with real users without breaking single-row queries.';

-- Auto-create a profile row when a new auth user is created.
-- Set role via user_metadata.role when creating the user (or update manually after).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'employee')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── settings ────────────────────────────────────────────────────────────────
create table public.settings (
  id                              uuid primary key default uuid_generate_v4(),
  employer_name                   text,
  employer_ein                    text,
  employer_address                text,
  employer_phone                  text,
  -- NY DTF employer registration number — W-2 Box 15 (migration 0021)
  employer_ny_state_id            text,
  employee_name                   text,
  -- Employee name split for W-2 Box e + address for Box f (migration 0021)
  employee_name_first             text,
  employee_name_middle_initial    text,
  employee_name_last              text,
  employee_address                text,
  employee_email                  text,
  employee_hourly_rate            numeric(10,2),
  federal_withholding_per_period  numeric(10,2) default 0,
  state_withholding_per_period    numeric(10,2) default 0,
  -- NY DBL / PFL coverage toggles. Default false — deduct only if covered
  -- (migration 0018 replaced the old pfl_waived column with pfl_covered).
  dbl_covered                     boolean not null default false,
  pfl_covered                     boolean not null default false,
  -- numeric(7,5): NY UI rates carry 3 decimal places as a percentage,
  -- i.e. 5 as a fraction (migration 0034 widened from numeric(6,4))
  suta_rate                       numeric(7,5) not null default 0.041,
  additional_emails               text[] not null default '{}',
  reply_to_emails                 text[] not null default '{}',
  reminder_emails                 text[] not null default '{"Persad.household@gmail.com"}',
  -- HYSA reconciliation: most recent admin-entered actual bank balance
  hysa_actual_balance             numeric(10,2),
  hysa_actual_balance_at          timestamptz,
  updated_at                      timestamptz not null default now()
);

-- Ensure only one row ever exists
create unique index settings_single_row on public.settings ((true));

-- Seed the single settings row
insert into public.settings (id) values (uuid_generate_v4());

-- ── paystubs ────────────────────────────────────────────────────────────────
create table public.paystubs (
  id                    uuid primary key default uuid_generate_v4(),
  stub_number           integer not null,
  employee_id           uuid not null references public.profiles(id),
  pay_period_start      date not null,
  pay_period_end        date not null,
  pay_date              date not null,
  hours_worked          numeric(6,2) not null default 0,
  overtime_hours        numeric(6,2) not null default 0,
  -- Sick hours used during this stub's period. Sums across the year drive
  -- the on-demand summary required by NY Labor Law § 196-b(4).
  sick_hours            numeric(6,2) not null default 0,
  -- Optional context for zero-hour weeks: 'week_off' / 'sick_unpaid' /
  -- 'vacation_unpaid' / 'holiday_unpaid' / 'other'.
  reason                text,
  -- Per-day hours breakdown when admin used daily-entry mode. Keys are
  -- YYYY-MM-DD; values are hours worked that day. NULL for stubs created
  -- in total-hours mode. Enables accurate day-count for DBL/PFL threshold
  -- watch and per-day display in the calendar view.
  daily_hours           jsonb default null,
  hourly_rate           numeric(10,2) not null,
  gross_pay             numeric(10,2) not null,
  federal_withholding   numeric(10,2) not null default 0,
  fica_social_security  numeric(10,2) not null default 0,
  fica_medicare         numeric(10,2) not null default 0,
  state_withholding     numeric(10,2) not null default 0,
  sdi                   numeric(10,2) not null default 0,
  pfl                   numeric(10,2) not null default 0,
  employer_fica_ss      numeric(10,2) not null default 0,
  employer_fica_medicare numeric(10,2) not null default 0,
  futa                  numeric(10,2) not null default 0,
  suta                  numeric(10,2) not null default 0,
  net_pay               numeric(10,2) not null default 0,
  -- Generation-time snapshots (migration 0018) so edit mode reads stored
  -- values, not live settings. suta_rate_at_generation is nullable: NULL
  -- means stub was created before Phase 12 (treat as settings SUTA rate).
  dbl_covered_at_generation boolean not null default false,
  pfl_covered_at_generation boolean not null default false,
  suta_rate_at_generation   numeric(7,5),
  payment_sent          boolean not null default false,
  zelle_transaction_id  text,
  stub_sent             boolean not null default false,
  -- Email delivery metadata (remote migration phase1_schema_additions,
  -- 2026-05-09): when the stub email fired and Resend's message id for it.
  stub_sent_at          timestamptz,
  resend_message_id     text,
  -- HYSA transfer: marks when the admin has moved the per-stub
  -- tax/withholding cash to the high-yield savings account that holds it
  -- until quarterly/annual filings are paid. Amount is derived from the
  -- stub's other columns (sum of withholdings + employer taxes).
  hysa_transferred      boolean not null default false,
  hysa_transferred_at   timestamptz,
  hysa_notes            text,
  created_at            timestamptz not null default now(),
  created_by            uuid not null references public.profiles(id),
  constraint stub_number_positive check (stub_number > 0),
  -- No two stubs ever share a number, even under concurrent inserts (migration 0024)
  constraint paystubs_stub_number_unique unique (stub_number),
  constraint paystubs_overtime_within_total check (overtime_hours >= 0 and overtime_hours <= hours_worked),
  constraint paystubs_reason_known check (reason is null or reason in ('week_off', 'sick_unpaid', 'vacation_unpaid', 'holiday_unpaid', 'other'))
);

create index paystubs_employee_id_idx on public.paystubs(employee_id);
create index paystubs_created_at_idx on public.paystubs(created_at desc);
create index paystubs_stub_number_idx on public.paystubs(stub_number desc);

-- ── Stub numbering (migrations 0024 + 0039) ─────────────────────────────────
-- A sequence is a true high-water counter — it only moves forward, so a
-- deleted tail number stays retired ("stub numbers are never reused"). An
-- aborted insert can burn a number; gaps are permanent by design. The BEFORE
-- INSERT trigger overwrites any client-supplied stub_number, making the
-- client value advisory only.
create sequence public.paystubs_stub_number_seq owned by public.paystubs.stub_number;

create or replace function public.next_paystub_number()
  returns integer
  language sql
  security definer
  as $$
    select nextval('public.paystubs_stub_number_seq')::integer
  $$;

create or replace function public.assign_stub_number()
  returns trigger
  language plpgsql
  as $$
begin
  new.stub_number := public.next_paystub_number();
  return new;
end;
$$;

create trigger paystubs_assign_stub_number
  before insert on public.paystubs
  for each row execute function public.assign_stub_number();

-- ── paystubs_with_tax_year view (migrations 0018 / 0034 / 0035) ─────────────
-- Paystubs enriched with tax_year for composite YTD predicates ("stubs before
-- this one this year") that respect both pay_date ordering and stub_number as
-- a tiebreaker for same-day stubs.
create view public.paystubs_with_tax_year as
select
  id,
  stub_number,
  employee_id,
  pay_period_start,
  pay_period_end,
  pay_date,
  hours_worked,
  hourly_rate,
  gross_pay,
  federal_withholding,
  fica_social_security,
  fica_medicare,
  state_withholding,
  sdi,
  pfl,
  employer_fica_ss,
  employer_fica_medicare,
  futa,
  suta,
  net_pay,
  payment_sent,
  zelle_transaction_id,
  stub_sent,
  created_at,
  created_by,
  overtime_hours,
  sick_hours,
  reason,
  hysa_transferred,
  hysa_transferred_at,
  hysa_notes,
  daily_hours,
  dbl_covered_at_generation,
  pfl_covered_at_generation,
  suta_rate_at_generation,
  extract(year from pay_date)::integer as tax_year
from paystubs;

-- security_invoker (migration 0035): the view runs with the caller's
-- privileges so the paystubs RLS policies apply to queries through it.
-- Without this, any authenticated user could read every paystub row.
alter view public.paystubs_with_tax_year set (security_invoker = true);

-- ── reminders ───────────────────────────────────────────────────────────────
create table public.reminders (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  due_date    date not null,
  description text not null,
  dismissed   boolean not null default false,
  email_sent  boolean not null default false,
  -- 10-day follow-up email flag (remote migration phase1_schema_additions,
  -- 2026-05-09): email_sent covers the 20-day first notice.
  followup_email_sent boolean not null default false,
  created_at  timestamptz not null default now()
);

create index reminders_due_date_idx on public.reminders(due_date);

-- ── onboarding_checklist ─────────────────────────────────────────────────────
create table public.onboarding_checklist (
  id         uuid primary key default uuid_generate_v4(),
  label      text not null,
  detail     text not null,
  completed  boolean not null default false,
  sort_order integer not null
);

-- ── year_end_checklist ───────────────────────────────────────────────────────
create table public.year_end_checklist (
  id         uuid primary key default gen_random_uuid(),
  tax_year   integer not null,
  label      text not null,
  detail     text not null,
  completed  boolean not null default false,
  sort_order integer not null,
  created_at timestamptz default now()
);

create unique index year_end_checklist_year_sort on public.year_end_checklist (tax_year, sort_order);

-- ── w2s ─────────────────────────────────────────────────────────────────────
create table public.w2s (
  id                    uuid primary key default uuid_generate_v4(),
  employee_id           uuid not null references public.profiles(id),
  tax_year              integer not null,
  wages_tips            numeric(12,2) not null,
  federal_tax_withheld  numeric(12,2) not null,
  ss_wages              numeric(12,2) not null,
  ss_tax_withheld       numeric(12,2) not null,
  medicare_wages        numeric(12,2) not null,
  medicare_tax_withheld numeric(12,2) not null,
  state_wages           numeric(12,2) not null,
  state_tax_withheld    numeric(12,2) not null,
  -- SSA filing lock (migration 0028): once filed, the UI warns before replace
  filed_with_ssa        boolean not null default false,
  filed_with_ssa_at     timestamptz,
  -- W-2c tracking (migration 0038): set when a filed W-2 is regenerated with
  -- different amounts; cleared on the next Mark Filed w/ SSA
  needs_w2c             boolean not null default false,
  generated_at          timestamptz not null default now(),
  generated_by          uuid not null references public.profiles(id),
  constraint w2s_unique_year unique (employee_id, tax_year)
);

comment on column public.w2s.needs_w2c is
  'True when this W-2 was regenerated with different amounts after being filed with the SSA. A Form W-2c must be filed; cleared on the next Mark Filed w/ SSA.';

-- ── tax_rates ───────────────────────────────────────────────────────────────
-- Versioned snapshot of statutory rates per calendar year. calculateTaxes
-- looks up the row matching the stub's pay_date year. New row added each
-- December via the "Verify YYYY tax rates" reminder.
create table public.tax_rates (
  id                  uuid primary key default uuid_generate_v4(),
  effective_year      integer not null unique,
  fica_ss_rate        numeric(8,5)  not null,
  fica_medicare_rate  numeric(8,5)  not null,
  ss_wage_base        numeric(12,2) not null,
  futa_rate           numeric(8,5)  not null,
  futa_wage_base      numeric(12,2) not null,
  suta_wage_base      numeric(12,2) not null,
  sdi_rate            numeric(8,5)  not null,
  sdi_weekly_cap      numeric(8,2)  not null,
  pfl_rate            numeric(8,5)  not null,
  pfl_annual_cap      numeric(10,2) not null,
  irs_mileage_rate             numeric(6,4)  not null,
  fica_household_threshold     numeric(10,2) not null default 0, -- IRS Pub 926 (migration 0018)
  futa_quarterly_threshold     numeric(10,2) not null default 0, -- IRS Pub 926 (migration 0018)
  rsf_rate                     numeric       not null default 0.00075, -- NY UI Re-employment Service Fund surcharge (remote migration phase2_audit_fixes)
  source_notes        text,
  created_at          timestamptz   not null default now()
);

create index tax_rates_year_idx on public.tax_rates (effective_year desc);

-- ── paystub_line_items ──────────────────────────────────────────────────────
-- Additional pay (bonus, holiday pay, mileage reimbursement, etc.) attached
-- to a paystub. Tax-flag columns mirror IRS Pub 926 / Pub 15-B classification
-- so each line item can be FICA / federal / NY state / W-2 Box 1 taxable
-- independently. Default true for safety (non-taxable items must be picked
-- deliberately).
create table public.paystub_line_items (
  id                  uuid primary key default uuid_generate_v4(),
  paystub_id          uuid not null references public.paystubs(id) on delete cascade,
  line_type           text not null,
  label               text not null,
  amount              numeric(10,2) not null,
  taxable_fed         boolean not null default true,
  taxable_fica        boolean not null default true,
  taxable_ny          boolean not null default true,
  w2_box1             boolean not null default true,
  informational_only  boolean not null default false,
  -- True when handed to the employee outside the regular Zelle payment
  -- (gift card given in person, cash bonus paid separately). Subtracted
  -- from the displayed "Cash to send via Zelle" total.
  given_separately    boolean not null default false,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now()
);

create index paystub_line_items_paystub_id_idx on public.paystub_line_items (paystub_id);

-- ── audit_log ───────────────────────────────────────────────────────────────
-- Forensic record of changes to financially significant tables. Populated by
-- public.audit_trigger() — never written to directly by the application.
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

-- ── push_subscriptions ──────────────────────────────────────────────────────
-- Web Push subscriptions per device. One row per (user, endpoint). Server
-- prunes on 410 Gone / 404 Not Found from web-push.sendNotification.
create table public.push_subscriptions (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  endpoint      text not null unique,
  p256dh_key    text not null,
  auth_key      text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- ── signed_documents ────────────────────────────────────────────────────────
-- Tracks redundancy copies of signed legal/HR docs uploaded to the
-- signed-documents Storage bucket. Physical originals live in the user's
-- home fire-safe; this is a *secondary* backup, not the system of record.
create table public.signed_documents (
  id              uuid primary key default uuid_generate_v4(),
  document_type   text not null check (
    document_type in (
      'sick_leave_policy', 'sick_leave_summary', 'ls59', 'pfl_waiver',
      'w4', 'it2104', 'ein_confirmation', 'nys_registration', 'i9',
      'sexual_harassment_policy', 'sexual_harassment_training_certificate',
      'day_of_rest_acknowledgement', 'posters_bundle'
    )
  ),
  file_path       text not null,
  file_name       text,
  file_size_bytes integer,
  mime_type       text,
  uploaded_at     timestamptz not null default now(),
  uploaded_by     uuid references public.profiles(id),
  notes           text
);

-- Single copy per document type, except sick_leave_summary — each employee
-- request produces a distinct copy kept for record-keeping (migration 0030).
create unique index signed_documents_single_type_unique
  on public.signed_documents (document_type)
  where document_type != 'sick_leave_summary';

-- ── withholding_forms ───────────────────────────────────────────────────────
-- Captures W-4 and IT-2104 form values + the per-period dollar amount the
-- admin computed via canonical sources (IRS estimator / Pub NYS-50-T).
-- settings.federal_withholding_per_period and
-- settings.state_withholding_per_period stay the source of truth for the
-- tax engine; this table is the auditable record of how those values were
-- derived.
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

-- ── filings ─────────────────────────────────────────────────────────────────
-- Permanent record of NYS-45 quarterly and Schedule H annual submissions.
-- Created when admin marks a filing as "filed" from the filings detail view.
create table public.filings (
  id                       uuid primary key default uuid_generate_v4(),
  filing_type              text not null check (filing_type in ('NYS-45', 'Schedule H', 'Federal Estimated Tax')),
  tax_year                 integer not null,
  quarter                  integer check (quarter is null or quarter between 1 and 4),
  filed_on                 date,
  amount_paid              numeric(12,2),    -- saved at filing time for YTD tracking (remote migration filings_amount_paid)
  confirmation             text,
  notes                    text,
  not_applicable           boolean not null default false, -- (migration 0027)
  not_applicable_reason    text,
  created_at               timestamptz not null default now(),
  created_by               uuid references public.profiles(id),
  constraint filings_quarter_consistency check (
    (filing_type = 'Schedule H' and quarter is null) or
    (filing_type in ('NYS-45', 'Federal Estimated Tax') and quarter is not null)
  ),
  constraint filings_status_exclusivity check (
    not (filed_on is not null and not_applicable = true)
  )
);

comment on column public.filings.not_applicable is
  'True when the filing is permanently irrelevant for this household (e.g., quarter prior to first stub). Mutually exclusive with filed_on. Suppresses the Overdue badge on the filings list and on the dashboard NextFilingCard.';
comment on column public.filings.not_applicable_reason is
  'Optional free-text explanation shown next to the Not applicable badge.';

create unique index filings_unique
  on public.filings (filing_type, tax_year, coalesce(quarter, 0));

create index filings_year_idx on public.filings (tax_year desc);

-- ── hysa_transactions ────────────────────────────────────────────────────────
-- Running ledger of all money in/out of the high-yield savings account used to
-- hold employee withholdings + employer taxes until quarterly/annual filings
-- are paid. Deposits auto-created on HYSA mark; withdrawals auto-created on
-- filing mark-as-paid; manual entries for out-of-band moves; deposit_interest
-- for bank interest posted to the account (migration 0033).
create table public.hysa_transactions (
  id               uuid primary key default uuid_generate_v4(),
  transaction_type text not null,
  amount           numeric(10,2) not null,
  paystub_id       uuid references public.paystubs(id) on delete set null,
  filing_id        uuid references public.filings(id) on delete set null,
  effective_date   date not null,
  notes            text,
  actor_id         uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  constraint hysa_transactions_transaction_type_check check (transaction_type in (
    'deposit_paystub', 'deposit_manual', 'deposit_interest',
    'withdrawal_filing', 'withdrawal_manual', 'balance_correction'
  )),
  constraint hysa_amount_sign check (
    (transaction_type in ('deposit_paystub', 'deposit_manual', 'deposit_interest') and amount > 0)
    or (transaction_type in ('withdrawal_filing', 'withdrawal_manual') and amount < 0)
    or (transaction_type = 'balance_correction')
  )
);

create index hysa_transactions_effective_date_idx on public.hysa_transactions (effective_date desc);
create index hysa_transactions_paystub_id_idx    on public.hysa_transactions (paystub_id);
create index hysa_transactions_filing_id_idx     on public.hysa_transactions (filing_id);

-- DB backstop: a stub can never carry two ledger deposits (migration 0037)
create unique index hysa_transactions_one_deposit_per_stub
  on public.hysa_transactions (paystub_id)
  where transaction_type = 'deposit_paystub';

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.paystubs enable row level security;
alter table public.reminders enable row level security;
alter table public.onboarding_checklist enable row level security;
alter table public.w2s enable row level security;
alter table public.tax_rates enable row level security;
alter table public.filings enable row level security;
alter table public.paystub_line_items enable row level security;
alter table public.audit_log enable row level security;
alter table public.signed_documents enable row level security;
alter table public.withholding_forms enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.year_end_checklist enable row level security;
alter table public.hysa_transactions enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- profiles
create policy "Users can read own profile" on public.profiles
  for select using (id = auth.uid());
create policy "Admins can read all profiles" on public.profiles
  for select using (public.is_admin());
create policy "Admins can update profiles" on public.profiles
  for update using (public.is_admin());

-- settings
create policy "Admins full access to settings" on public.settings
  for all using (public.is_admin());

-- paystubs
create policy "Admins full access to paystubs" on public.paystubs
  for all using (public.is_admin());
create policy "Employees read own paystubs" on public.paystubs
  for select using (employee_id = auth.uid());
-- RESTRICTIVE guard: ANDed with the permissive policies above, so even an
-- admin cannot delete a stub already marked payment_sent through the API
-- (remote migration phase1_schema_additions)
create policy "no_delete_paid_stubs" on public.paystubs
  as restrictive
  for delete to authenticated using (payment_sent = false);

-- reminders
create policy "Admins full access to reminders" on public.reminders
  for all using (public.is_admin());

-- onboarding_checklist
create policy "Admins full access to checklist" on public.onboarding_checklist
  for all using (public.is_admin());

-- year_end_checklist
create policy "Admins can manage year_end_checklist"
  on public.year_end_checklist
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- w2s
create policy "Admins full access to w2s" on public.w2s
  for all using (public.is_admin());
create policy "Employees read own w2s" on public.w2s
  for select using (employee_id = auth.uid());

-- tax_rates (admins full; employees read-only — needed for stub display math)
create policy "Admins full access to tax_rates" on public.tax_rates
  for all using (public.is_admin());
create policy "Employees read tax_rates" on public.tax_rates
  for select using (not public.is_admin());

-- filings (admin only)
create policy "Admins full access to filings" on public.filings
  for all using (public.is_admin());

-- hysa_transactions (admin only)
create policy "Admins full access to hysa_transactions"
  on public.hysa_transactions for all using (public.is_admin());

-- paystub_line_items
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

-- audit_log (admin read only — writes happen exclusively through triggers)
create policy "Admins read audit_log" on public.audit_log
  for select using (public.is_admin());

-- signed_documents
create policy "Admins full access to signed_documents"
  on public.signed_documents for all using (public.is_admin());

-- withholding_forms
create policy "Admins full access to withholding_forms"
  on public.withholding_forms for all using (public.is_admin());

-- push_subscriptions (users manage own; admins read all)
create policy "Users manage own push subscriptions"
  on public.push_subscriptions for all using (user_id = auth.uid());
create policy "Admins read all push subscriptions"
  on public.push_subscriptions for select using (public.is_admin());

-- ── MFA status RPC (migration 0016) ──────────────────────────────────────────
-- Returns the set of user IDs that have a verified TOTP MFA factor.
-- SECURITY DEFINER with search_path allows querying auth.mfa_factors
-- from application code without exposing the auth schema directly.
create or replace function public.get_verified_mfa_user_ids()
returns table(user_id uuid)
language sql
security definer
set search_path = auth, public
as $$
  select distinct user_id
  from auth.mfa_factors
  where status = 'verified';
$$;

-- Only admins (service role) should call this.
revoke all on function public.get_verified_mfa_user_ids() from public;
grant execute on function public.get_verified_mfa_user_ids() to service_role;

-- ── Audit trigger function ───────────────────────────────────────────────────
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
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

create trigger signed_documents_audit
  after insert or update or delete on public.signed_documents
  for each row execute procedure public.audit_trigger();

create trigger withholding_forms_audit
  after insert or update or delete on public.withholding_forms
  for each row execute procedure public.audit_trigger();

create trigger push_subscriptions_audit
  after insert or update or delete on public.push_subscriptions
  for each row execute procedure public.audit_trigger();

-- Name kept as created by migration 0013 (audit_* prefix, not *_audit)
create trigger audit_hysa_transactions
  after insert or update or delete on public.hysa_transactions
  for each row execute procedure public.audit_trigger();

-- Traces reminder dismissals and auto-created roll-forward rows (migration 0025)
create trigger reminders_audit
  after insert or update or delete on public.reminders
  for each row execute procedure public.audit_trigger();

-- ── Storage: signed-documents bucket (migration 0008) ────────────────────────
insert into storage.buckets (id, name, public)
values ('signed-documents', 'signed-documents', false)
on conflict (id) do nothing;

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

-- ── Seed: Onboarding Checklist ───────────────────────────────────────────────
-- Order is logical / priority:
--   1–2   registrations (prerequisite)
--   3–13  at-hire compliance (required at or before first day)
--   14–16 app setup
--   17–20 email infrastructure (lowest priority — app works without it)
--   21    voluntary Workers' Comp recommendation
insert into public.onboarding_checklist (label, detail, sort_order) values
  ('Apply for Federal EIN at irs.gov', 'File IRS Form SS-4 online at irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online', 1),
  ('Register with New York State', 'File Form NYS-100 at labor.ny.gov to register as a household employer', 2),
  ('Provide signed LS-59 Wage Notice to employee', 'NY Labor Law § 195(1) (WTPA) requires a written wage notice at hire and with any change. Use form LS-59 (household employers, available at https://dol.ny.gov/form-ls-59-exempt-employees). Sign two copies — give one to employee, retain one for 6 years.', 3),
  ('Complete USCIS Form I-9 (Employment Eligibility Verification)', 'Required for every U.S. employee. Section 1: employee fills on or before first day of work. Section 2: you fill within 3 business days after examining her ID documents (List A alone, OR List B + List C). Do NOT mail this anywhere — retain in your files. Keep for 3 years from hire OR 1 year after termination, whichever is later. Form: https://www.uscis.gov/i-9', 4),
  ('Have employee complete Federal W-4', 'Federal income tax withholding is voluntary for household employees (IRS Pub 926). Obtain a signed W-4 before setting a withholding amount in Settings — without a signed form, keep federal_withholding_per_period at $0.', 5),
  ('Have employee complete NY IT-2104', 'NY state withholding is voluntary for household employees (NY DTF guidance). Obtain a signed IT-2104 before setting a withholding amount in Settings. If she claims full NY tax exemption (low income), she files IT-2104-E instead — withhold $0 for NY state in that case.', 6),
  ('Obtain signed PFL-Waiver form (employee <20 hrs/week)', 'Document the schedule analysis (one-page memo: hours per week × days per year). She works <20 hrs/wk AND <175 days/52 wks, so PFL coverage does not apply — the PFL deduction is off by default in Settings. Optional belt-and-suspenders: have her sign the PFL waiver form at https://www.wcb.ny.gov/content/main/forms/PFLWaiver.pdf and retain it.', 7),
  ('Print, sign, and file the Sick Leave Policy', 'Open Documents → Sick Leave Policy in the app, print it, have both employer and employee sign, and store the signed copy. Recommended: commit a scanned PDF to /docs/signed/sick-leave-policy.pdf in the repo so it''s preserved alongside the source code.', 8),
  ('Adopt and distribute Sexual Harassment Prevention Policy', 'NY Labor Law § 201-g requires all employers (including 1-employee households) to adopt the NYS model policy or a compliant equivalent and distribute it to each employee at hire and annually. Free model policy at https://www.ny.gov/combating-sexual-harassment-workplace. Retain signed acknowledgement.', 9),
  ('Complete annual interactive harassment-prevention training', 'Free NYS-provided interactive training at https://www.ny.gov/sexual-harassment-prevention-employees. Complete with employee at hire and every calendar year thereafter. Retain training certificate. Cadence: each calendar year (NY DOL FAQ).', 10),
  ('Acknowledge NY Day of Rest rule (§ 161)', 'NY Labor Law § 161 mandates 24 consecutive hours off per calendar week for domestic workers. If she voluntarily works that day, the entire day is paid at 1.5×. Have both parties sign a one-paragraph acknowledgement and retain for the duration of employment.', 11),
  ('Print and post required workplace posters', 'Place all in a binder or kitchen/work area where employee can read: (1) NYS Domestic Workers Bill of Rights — https://dol.ny.gov/system/files/documents/2021/03/p715-english.pdf (2) NYS Sexual Harassment Prevention Notice — https://www.ny.gov/sites/default/files/atoms/files/SexualHarassmentNoticeofRights.pdf (3) NYS Minimum Wage Information (4) Federal FLSA Your Rights (WH-1088) — https://www.dol.gov/agencies/whd/posters (5) Federal EEO / USERRA / Polygraph Protection. Source: https://dol.ny.gov/required-workplace-posters', 12),
  ('File new hire report with NY', 'Report within 20 days of hire at https://www.nynewhire.com/ (NY Tax Law § 171-h). Reference: https://www.tax.ny.gov/bus/newhire/. Submit IT-2104 with the new-hire box checked, OR Form IT-2104.1, OR upload via the online portal.', 13),
  ('Create Supabase user accounts for all three users', 'Create accounts in Supabase Auth dashboard with role metadata', 14),
  ('Fill out all fields in Persad Pay Settings', 'Navigate to Settings and complete all employer/employee fields', 15),
  ('Confirm quarterly reminders are seeded in Reminders tab', 'Check that all NYS-45 and Schedule H reminders appear', 16),
  ('Purchase persadpay.com domain', 'Purchase at GoDaddy or your preferred registrar', 17),
  ('Add Vercel DNS records to domain registrar', 'Point your domain to Vercel after deploying', 18),
  ('Sign up for Resend and verify persadpay.com', 'Verify the domain for outbound email at resend.com', 19),
  ('Switch email FROM to payroll@persadpay.com', 'Currently using Resend''s sandbox sender (onboarding@resend.dev) which only delivers to addresses verified on the Resend account. Once persadpay.com is purchased AND verified in Resend (SPF/DKIM DNS records), update the FROM constant in src/lib/email.ts to ''Persad Pay <payroll@persadpay.com>''.', 20),
  ('Consider voluntary Workers'' Comp policy (recommended, not required)', 'NY Workers'' Comp is NOT required at <40 hrs/wk live-out per WCB rule, but every household-payroll service (HomePay, GTM, HWS) recommends voluntary coverage in case of an on-the-job injury. Quote available through NYSIF (https://www.nysif.com) or any private carrier. This is a recommendation, not a mandate.', 21);

-- ── Seed: Reminders (2026) ───────────────────────────────────────────────────
-- Due dates are STATUTORY; weekend/holiday shifting happens at display time
-- via shiftedDeadline() in dates.ts (migration 0036).
insert into public.reminders (title, due_date, description) values
  ('NYS-45 Q1 2026', '2026-04-30', 'File NYS-45 (Quarterly Combined Withholding, Wage Reporting and Unemployment Insurance Return) for Q1 at labor.ny.gov'),
  ('Schedule H 2025', '2026-04-15', 'File Schedule H with your federal Form 1040 for household employment taxes paid in 2025. Due with your federal tax return.'),
  ('NYS-45 Q2 2026', '2026-07-31', 'File NYS-45 for Q2 at labor.ny.gov'),
  ('NYS-45 Q3 2026', '2026-10-31', 'File NYS-45 for Q3 at labor.ny.gov'),
  ('NYS-45 Q4 2026', '2027-01-31', 'File NYS-45 for Q4 at labor.ny.gov'),
  ('Verify 2027 tax rates', '2026-12-01', 'Update the tax_rates table with verified values for the upcoming year: FICA SS wage base, FUTA wage base, NY SUTA wage base, NY SDI rate/cap, NY PFL rate/cap, IRS standard mileage rate. Cite primary sources (IRS, NY DOL, NY DFS) in the migration commit message. See /docs/ROADMAP.md.

Also re-verify FUTA rate against the DOL credit-reduction list; NY''s status can change year-to-year. Page: https://oui.doleta.gov/unemploy/futa_credit.asp'),
  ('Federal Estimated Tax Q1 2026', '2026-04-15', 'Form 1040-ES Q1 estimated payment to IRS. Covers Jan–Mar wages. ~1/4 of projected annual Schedule H liability (FICA combined + FUTA + federal withholding). Pay via EFTPS or IRS Direct Pay.'),
  ('Federal Estimated Tax Q2 2026', '2026-06-15', 'Form 1040-ES Q2 estimated payment to IRS. Covers Apr–May wages. ~1/4 of projected annual Schedule H liability. Pay via EFTPS or IRS Direct Pay.'),
  ('Federal Estimated Tax Q3 2026', '2026-09-15', 'Form 1040-ES Q3 estimated payment to IRS. Covers Jun–Aug wages. ~1/4 of projected annual Schedule H liability. Pay via EFTPS or IRS Direct Pay.'),
  ('Federal Estimated Tax Q4 2026', '2027-01-15', 'Form 1040-ES Q4 estimated payment to IRS. Covers Sep–Dec wages. ~1/4 of projected annual Schedule H liability. Pay via EFTPS or IRS Direct Pay.'),
  ('Verify 2027 NY SUTA rate', '2027-02-15', 'NY DOL mails new annual SUTA rate notices in Feb–Mar. Once your 2027 rate notice arrives, update settings.suta_rate to match. Tracked separately from the December tax_rates verification because the rate notice arrives later.'),
  ('W-2 / W-3 to employee + SSA 2026', '2027-01-31', 'Furnish W-2 to babysitter by Jan 31, 2027. File W-2 Copy A + W-3 transmittal to SSA via Business Services Online (https://www.ssa.gov/bso/bsowelcome.htm) or paper by Jan 31, 2027.'),
  ('Sexual Harassment Prevention Training due 2027', '2027-01-31', 'Complete annual interactive sexual harassment prevention training with employee. Free NYS training at https://www.ny.gov/sexual-harassment-prevention-employees. Retain certificate. Required annually by NY Labor Law § 201-g (NY DOL FAQ: at least once each calendar year).');

-- ── Seed: Tax Rates (2026) ──────────────────────────────────────────────────
insert into public.tax_rates (
  effective_year, fica_ss_rate, fica_medicare_rate, ss_wage_base,
  futa_rate, futa_wage_base, suta_wage_base,
  sdi_rate, sdi_weekly_cap, pfl_rate, pfl_annual_cap,
  irs_mileage_rate, fica_household_threshold, futa_quarterly_threshold, rsf_rate,
  source_notes
) values (
  2026, 0.062, 0.0145, 184500,
  0.006, 7000, 17600,
  0.005, 0.60, 0.00432, 411.91,
  0.725, 3000, 1000, 0.00075,
  'Verified 2026-05-05 (updated 2026-05-09). Sources: IRS Topic 751 (FICA, SS wage base); IRS Pub 926 (FUTA); NY DOL NYS-50 publication (SUTA wage base $17,600 for NY 2026 — formula change: 18% of state average annual wage, permanent from 2026); NY DFS 2026 PFL rate decision (PFL rate 0.432%, cap $411.91); NY DFS / WCB (SDI 0.5% / $0.60 weekly cap); IRS Notice 2026-10 (mileage 72.5¢/mi). See /docs/ROADMAP.md.'
);

-- ── Grants ────────────────────────────────────────────────────────────────────
-- Required so the anon/authenticated/service_role Postgres roles can access
-- tables created via raw SQL (the dashboard table editor adds these automatically).
grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.paystubs to authenticated;
grant select, insert, update, delete on public.settings to authenticated;  -- INSERT/DELETE revoked (0029) then re-granted (0032): upsert needs INSERT; RLS still admin-only
grant select, insert, update on public.reminders to authenticated;  -- DELETE revoked (migration 0029): reminders are dismissed, not deleted
grant select, update on public.onboarding_checklist to authenticated; -- INSERT/DELETE revoked (migration 0029): pre-seeded items
grant select, insert, update, delete on public.year_end_checklist to authenticated;
grant select, insert, update, delete on public.w2s to authenticated;
grant select on public.tax_rates to authenticated;                  -- INSERT/UPDATE/DELETE revoked (migration 0029): updated only via migrations
grant select, insert, update, delete on public.filings to authenticated;
grant select, insert, update, delete on public.paystub_line_items to authenticated;
grant select on public.audit_log to authenticated;  -- INSERT revoked (migration 0025); writes via triggers only
grant select, insert, update, delete on public.signed_documents to authenticated;
grant select, insert, update, delete on public.withholding_forms to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.hysa_transactions to authenticated;  -- was missing at creation; fixed by migration 0031
grant select on public.paystubs_with_tax_year to authenticated, service_role;  -- view runs security_invoker, so paystubs RLS applies

-- anon role has no table access — all routes require authentication
