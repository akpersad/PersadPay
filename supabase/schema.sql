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
  employee_name                   text,
  employee_id_display             text,
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
  constraint stub_number_positive check (stub_number > 0)
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

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.paystubs enable row level security;
alter table public.reminders enable row level security;
alter table public.onboarding_checklist enable row level security;
alter table public.w2s enable row level security;

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

-- ── Seed: Onboarding Checklist ───────────────────────────────────────────────
insert into public.onboarding_checklist (label, detail, sort_order) values
  ('Apply for Federal EIN at irs.gov', 'File IRS Form SS-4 online at irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online', 1),
  ('Register with New York State', 'File Form NYS-100 at labor.ny.gov to register as a household employer', 2),
  ('File new hire report with NY', 'Report within 20 days of hire at labor.ny.gov/newhire — required by law', 3),
  ('Have employee complete Federal W-4', 'Withholding certificate required before first paycheck', 4),
  ('Have employee complete NY IT-2104', 'NY State equivalent of the W-4', 5),
  ('Determine PFL waiver eligibility', 'Employees working <20 hrs/week may waive PFL. Obtain signed waiver if applicable.', 6),
  ('Purchase persadpay.com domain', 'Purchase at GoDaddy or your preferred registrar', 7),
  ('Add Vercel DNS records to domain registrar', 'Point your domain to Vercel after deploying', 8),
  ('Sign up for Resend and verify persadpay.com', 'Verify the domain for outbound email at resend.com', 9),
  ('Fill out all fields in Persad Pay Settings', 'Navigate to Settings and complete all employer/employee fields', 10),
  ('Create Supabase user accounts for all three users', 'Create accounts in Supabase Auth dashboard with role metadata', 11),
  ('Confirm quarterly reminders are seeded in Reminders tab', 'Check that all NYS-45 and Schedule H reminders appear', 12);

-- ── Seed: Reminders (2026) ───────────────────────────────────────────────────
insert into public.reminders (title, due_date, description) values
  ('NYS-45 Q1 2026', '2026-04-30', 'File NYS-45 (Quarterly Combined Withholding, Wage Reporting and Unemployment Insurance Return) for Q1 at labor.ny.gov'),
  ('Schedule H 2025', '2026-04-15', 'File Schedule H with your federal Form 1040 for household employment taxes paid in 2025. Due with your federal tax return.'),
  ('NYS-45 Q2 2026', '2026-07-31', 'File NYS-45 for Q2 at labor.ny.gov'),
  ('NYS-45 Q3 2026', '2026-10-31', 'File NYS-45 for Q3 at labor.ny.gov'),
  ('NYS-45 Q4 2026', '2027-01-31', 'File NYS-45 for Q4 at labor.ny.gov');

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

-- anon role has no table access — all routes require authentication
