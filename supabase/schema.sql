-- Persad Pay — Supabase Schema
-- Run this entire file in the Supabase SQL editor (Dashboard → SQL Editor → New query)

-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  email       text not null,
  role        text not null check (role in ('admin', 'employee')),
  created_at  timestamptz not null default now()
);

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
  employee_name                   text,
  employee_email                  text,
  employee_hourly_rate            numeric(10,2),
  federal_withholding_per_period  numeric(10,2) default 0,
  state_withholding_per_period    numeric(10,2) default 0,
  pfl_waived                      boolean not null default false,
  suta_rate                       numeric(6,4) not null default 0.041,
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
  payment_sent          boolean not null default false,
  zelle_transaction_id  text,
  stub_sent             boolean not null default false,
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
  constraint paystubs_overtime_within_total check (overtime_hours >= 0 and overtime_hours <= hours_worked),
  constraint paystubs_reason_known check (reason is null or reason in ('week_off', 'sick_unpaid', 'vacation_unpaid', 'holiday_unpaid', 'other'))
);

create index paystubs_employee_id_idx on public.paystubs(employee_id);
create index paystubs_created_at_idx on public.paystubs(created_at desc);
create index paystubs_stub_number_idx on public.paystubs(stub_number desc);

-- ── reminders ───────────────────────────────────────────────────────────────
create table public.reminders (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  due_date    date not null,
  description text not null,
  dismissed   boolean not null default false,
  email_sent  boolean not null default false,
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
  generated_at          timestamptz not null default now(),
  generated_by          uuid not null references public.profiles(id),
  constraint w2s_unique_year unique (employee_id, tax_year)
);

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
  irs_mileage_rate    numeric(6,4)  not null,
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
  document_type   text not null unique check (
    document_type in ('sick_leave_policy', 'sick_leave_summary', 'ls59', 'pfl_waiver', 'w4', 'it2104')
  ),
  file_path       text not null,
  file_name       text,
  file_size_bytes integer,
  mime_type       text,
  uploaded_at     timestamptz not null default now(),
  uploaded_by     uuid references public.profiles(id),
  notes           text
);

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
  id            uuid primary key default uuid_generate_v4(),
  filing_type   text not null check (filing_type in ('NYS-45', 'Schedule H', 'Federal Estimated Tax')),
  tax_year      integer not null,
  quarter       integer check (quarter is null or quarter between 1 and 4),
  filed_on      date,
  confirmation  text,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  constraint filings_quarter_consistency check (
    (filing_type = 'Schedule H' and quarter is null) or
    (filing_type in ('NYS-45', 'Federal Estimated Tax') and quarter is not null)
  )
);

create unique index filings_unique
  on public.filings (filing_type, tax_year, coalesce(quarter, 0));

create index filings_year_idx on public.filings (tax_year desc);

-- ── hysa_transactions ────────────────────────────────────────────────────────
-- Running ledger of all money in/out of the high-yield savings account used to
-- hold employee withholdings + employer taxes until quarterly/annual filings
-- are paid. Deposits auto-created on HYSA mark; withdrawals auto-created on
-- filing mark-as-paid; manual entries for out-of-band moves.
create table public.hysa_transactions (
  id               uuid primary key default uuid_generate_v4(),
  transaction_type text not null check (transaction_type in (
    'deposit_paystub', 'deposit_manual', 'withdrawal_filing',
    'withdrawal_manual', 'balance_correction'
  )),
  amount           numeric(10,2) not null,
  paystub_id       uuid references public.paystubs(id) on delete set null,
  filing_id        uuid references public.filings(id) on delete set null,
  effective_date   date not null,
  notes            text,
  actor_id         uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  constraint hysa_amount_sign check (
    (transaction_type in ('deposit_paystub', 'deposit_manual') and amount > 0)
    or (transaction_type in ('withdrawal_filing', 'withdrawal_manual') and amount < 0)
    or (transaction_type = 'balance_correction')
  )
);

create index hysa_transactions_effective_date_idx on public.hysa_transactions (effective_date desc);
create index hysa_transactions_paystub_id_idx    on public.hysa_transactions (paystub_id);
create index hysa_transactions_filing_id_idx     on public.hysa_transactions (filing_id);

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

-- reminders
create policy "Admins full access to reminders" on public.reminders
  for all using (public.is_admin());

-- onboarding_checklist
create policy "Admins full access to checklist" on public.onboarding_checklist
  for all using (public.is_admin());

-- w2s
create policy "Admins full access to w2s" on public.w2s
  for all using (public.is_admin());
create policy "Employees read own w2s" on public.w2s
  for select using (employee_id = auth.uid());

-- tax_rates (admin only — employees have no need to see statutory rates)
create policy "Admins full access to tax_rates" on public.tax_rates
  for all using (public.is_admin());

-- filings (admin only)
create policy "Admins full access to filings" on public.filings
  for all using (public.is_admin());

-- hysa_transactions (admin only)
alter table public.hysa_transactions enable row level security;
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

create trigger hysa_transactions_audit
  after insert or update or delete on public.hysa_transactions
  for each row execute procedure public.audit_trigger();

-- ── Seed: Onboarding Checklist ───────────────────────────────────────────────
-- Order is logical / priority:
--   1–2  registrations (prerequisite)
--   3–8  at-hire compliance (required at or before first day)
--   9–11 app setup
--   12–15 email infrastructure (lowest priority — app works without it)
insert into public.onboarding_checklist (label, detail, sort_order) values
  ('Apply for Federal EIN at irs.gov', 'File IRS Form SS-4 online at irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online', 1),
  ('Register with New York State', 'File Form NYS-100 at labor.ny.gov to register as a household employer', 2),
  ('Provide signed LS-59 Wage Notice to employee', 'NY Labor Law § 195(1) requires a Wage Theft Prevention Act notice at hire (Form LS-59 for hourly employees) in English plus the employee''s primary language. Employee signs; retain copy for 6 years. Form: https://dol.ny.gov/system/files/documents/2022/02/ls59.pdf', 3),
  ('Have employee complete Federal W-4', 'Withholding certificate required before first paycheck', 4),
  ('Have employee complete NY IT-2104', 'NY State equivalent of the W-4', 5),
  ('Obtain signed PFL-Waiver form (employee <20 hrs/week)', 'Employees working a regular schedule of <20 hrs/week AND fewer than 175 days in a 52-week period may waive PFL contributions. Use the official PFL-Waiver form at https://paidfamilyleave.ny.gov/pfl-waiver-form. Retain signed waiver for the entire duration of employment. Waiver auto-revokes if schedule changes — back contributions may be owed retroactively.', 6),
  ('Print, sign, and file the Sick Leave Policy', 'Open Documents → Sick Leave Policy in the app, print it, have both employer and employee sign, and store the signed copy. Recommended: commit a scanned PDF to /docs/signed/sick-leave-policy.pdf in the repo so it''s preserved alongside the source code.', 7),
  ('File new hire report with NY', 'Report within 20 days of hire at labor.ny.gov/newhire — required by law', 8),
  ('Create Supabase user accounts for all three users', 'Create accounts in Supabase Auth dashboard with role metadata', 9),
  ('Fill out all fields in Persad Pay Settings', 'Navigate to Settings and complete all employer/employee fields', 10),
  ('Confirm quarterly reminders are seeded in Reminders tab', 'Check that all NYS-45 and Schedule H reminders appear', 11),
  ('Purchase persadpay.com domain', 'Purchase at GoDaddy or your preferred registrar', 12),
  ('Add Vercel DNS records to domain registrar', 'Point your domain to Vercel after deploying', 13),
  ('Sign up for Resend and verify persadpay.com', 'Verify the domain for outbound email at resend.com', 14),
  ('Switch email FROM to payroll@persadpay.com', 'Currently using Resend''s sandbox sender (onboarding@resend.dev) which only delivers to addresses verified on the Resend account. Once persadpay.com is purchased AND verified in Resend (SPF/DKIM DNS records), update the FROM constant in src/lib/email.ts to ''Persad Pay <payroll@persadpay.com>''.', 15),
  ('Consider voluntary Workers'' Comp policy (recommended, not required)', 'NY Workers'' Comp is NOT required at <40 hrs/wk live-out per WCB rule, but every household-payroll service (HomePay, GTM, HWS) recommends voluntary coverage in case of an on-the-job injury. Quote available through NYSIF (https://www.nysif.com) or any private carrier. This is a recommendation, not a mandate.', 16);

-- ── Seed: Reminders (2026) ───────────────────────────────────────────────────
insert into public.reminders (title, due_date, description) values
  ('NYS-45 Q1 2026', '2026-04-30', 'File NYS-45 (Quarterly Combined Withholding, Wage Reporting and Unemployment Insurance Return) for Q1 at labor.ny.gov'),
  ('Schedule H 2025', '2026-04-15', 'File Schedule H with your federal Form 1040 for household employment taxes paid in 2025. Due with your federal tax return.'),
  ('NYS-45 Q2 2026', '2026-07-31', 'File NYS-45 for Q2 at labor.ny.gov'),
  ('NYS-45 Q3 2026', '2026-10-31', 'File NYS-45 for Q3 at labor.ny.gov'),
  ('NYS-45 Q4 2026', '2027-01-31', 'File NYS-45 for Q4 at labor.ny.gov'),
  ('Verify 2027 tax rates', '2026-12-01', 'Update the tax_rates table with verified values for the upcoming year: FICA SS wage base, FUTA wage base, NY SUTA wage base, NY SDI rate/cap, NY PFL rate/cap, IRS standard mileage rate. Cite primary sources (IRS, NY DOL, NY DFS) in the migration commit message. See /docs/ROADMAP.md.'),
  ('Federal Estimated Tax Q1 2026', '2026-04-15', 'Form 1040-ES Q1 estimated payment to IRS. Covers Jan–Mar wages. ~1/4 of projected annual Schedule H liability (FICA combined + FUTA + federal withholding). Pay via EFTPS or IRS Direct Pay.'),
  ('Federal Estimated Tax Q2 2026', '2026-06-15', 'Form 1040-ES Q2 estimated payment to IRS. Covers Apr–May wages. ~1/4 of projected annual Schedule H liability. Pay via EFTPS or IRS Direct Pay.'),
  ('Federal Estimated Tax Q3 2026', '2026-09-15', 'Form 1040-ES Q3 estimated payment to IRS. Covers Jun–Aug wages. ~1/4 of projected annual Schedule H liability. Pay via EFTPS or IRS Direct Pay.'),
  ('Federal Estimated Tax Q4 2026', '2027-01-15', 'Form 1040-ES Q4 estimated payment to IRS. Covers Sep–Dec wages. ~1/4 of projected annual Schedule H liability. Pay via EFTPS or IRS Direct Pay.'),
  ('Verify 2027 NY SUTA rate', '2027-02-15', 'NY DOL mails new annual SUTA rate notices in Feb–Mar. Once your 2027 rate notice arrives, update settings.suta_rate to match. Tracked separately from the December tax_rates verification because the rate notice arrives later.'),
  ('W-2 / W-3 to employee + SSA 2026', '2027-01-31', 'Furnish W-2 to babysitter by Jan 31, 2027. File W-2 Copy A + W-3 transmittal to SSA via Business Services Online (https://www.ssa.gov/bso/bsowelcome.htm) or paper by Jan 31, 2027.');

-- ── Seed: Tax Rates (2026) ──────────────────────────────────────────────────
insert into public.tax_rates (
  effective_year, fica_ss_rate, fica_medicare_rate, ss_wage_base,
  futa_rate, futa_wage_base, suta_wage_base,
  sdi_rate, sdi_weekly_cap, pfl_rate, pfl_annual_cap,
  irs_mileage_rate, source_notes
) values (
  2026, 0.062, 0.0145, 184500,
  0.006, 7000, 13000,
  0.005, 0.60, 0.00432, 411.91,
  0.725,
  'Verified 2026-05-05. Sources: IRS Topic 751 (FICA, SS wage base); IRS Pub 926 (FUTA); NY DOL UI rate notice (SUTA wage base $13,000 for NY 2026); NY DFS 2026 PFL rate decision (PFL rate 0.432%, cap $411.91); NY DFS / WCB (SDI 0.5% / $0.60 weekly cap); IRS Notice 2026-10 (mileage 72.5¢/mi). See /docs/ROADMAP.md.'
);

-- ── Grants ────────────────────────────────────────────────────────────────────
-- Required so the anon/authenticated/service_role Postgres roles can access
-- tables created via raw SQL (the dashboard table editor adds these automatically).
grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.paystubs to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
grant select, insert, update, delete on public.reminders to authenticated;
grant select, insert, update, delete on public.onboarding_checklist to authenticated;
grant select, insert, update, delete on public.w2s to authenticated;
grant select, insert, update, delete on public.tax_rates to authenticated;
grant select, insert, update, delete on public.filings to authenticated;
grant select, insert, update, delete on public.paystub_line_items to authenticated;
grant select, insert on public.audit_log to authenticated;
grant select, insert, update, delete on public.signed_documents to authenticated;
grant select, insert, update, delete on public.withholding_forms to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- anon role has no table access — all routes require authentication
