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

-- ── filings ─────────────────────────────────────────────────────────────────
-- Permanent record of NYS-45 quarterly and Schedule H annual submissions.
-- Created when admin marks a filing as "filed" from the filings detail view.
create table public.filings (
  id            uuid primary key default uuid_generate_v4(),
  filing_type   text not null check (filing_type in ('NYS-45', 'Schedule H')),
  tax_year      integer not null,
  quarter       integer check (quarter is null or quarter between 1 and 4),
  filed_on      date,
  confirmation  text,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  constraint filings_quarter_consistency check (
    (filing_type = 'NYS-45' and quarter is not null) or
    (filing_type = 'Schedule H' and quarter is null)
  )
);

create unique index filings_unique
  on public.filings (filing_type, tax_year, coalesce(quarter, 0));

create index filings_year_idx on public.filings (tax_year desc);

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
  ('Switch email FROM to payroll@persadpay.com', 'Currently using Resend''s sandbox sender (onboarding@resend.dev) which only delivers to addresses verified on the Resend account. Once persadpay.com is purchased AND verified in Resend (SPF/DKIM DNS records), update the FROM constant in src/lib/email.ts to ''Persad Pay <payroll@persadpay.com>''.', 15);

-- ── Seed: Reminders (2026) ───────────────────────────────────────────────────
insert into public.reminders (title, due_date, description) values
  ('NYS-45 Q1 2026', '2026-04-30', 'File NYS-45 (Quarterly Combined Withholding, Wage Reporting and Unemployment Insurance Return) for Q1 at labor.ny.gov'),
  ('Schedule H 2025', '2026-04-15', 'File Schedule H with your federal Form 1040 for household employment taxes paid in 2025. Due with your federal tax return.'),
  ('NYS-45 Q2 2026', '2026-07-31', 'File NYS-45 for Q2 at labor.ny.gov'),
  ('NYS-45 Q3 2026', '2026-10-31', 'File NYS-45 for Q3 at labor.ny.gov'),
  ('NYS-45 Q4 2026', '2027-01-31', 'File NYS-45 for Q4 at labor.ny.gov'),
  ('Verify 2027 tax rates', '2026-12-01', 'Update the tax_rates table with verified values for the upcoming year: FICA SS wage base, FUTA wage base, NY SUTA wage base, NY SDI rate/cap, NY PFL rate/cap, IRS standard mileage rate. Cite primary sources (IRS, NY DOL, NY DFS) in the migration commit message. See /docs/ROADMAP.md.');

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

-- anon role has no table access — all routes require authentication
