-- Phase 5 — HYSA ledger + reconciliation
-- Source: /docs/ROADMAP.md Phase 5
--
-- Creates a transaction ledger so every dollar flowing through the HYSA is
-- accounted for: automatic deposit when admin marks a stub HYSA-funded,
-- automatic withdrawal when a filing is marked as paid, and manual entries
-- for out-of-band moves (bank interest, rounding deposits, etc.).
-- A reconciliation field on settings lets the admin enter the actual bank
-- balance so the app can surface discrepancies.

-- ── hysa_transactions ──────────────────────────────────────────────────────
create table if not exists public.hysa_transactions (
  id               uuid primary key default uuid_generate_v4(),
  -- deposit_paystub  : auto-created when admin marks stub HYSA-funded
  -- deposit_manual   : admin-entered out-of-band deposit (interest, top-up, etc.)
  -- withdrawal_filing: auto-created when admin marks a filing as paid
  -- withdrawal_manual: admin-entered out-of-band withdrawal
  -- balance_correction: delta to reconcile app total vs. actual bank balance
  transaction_type text not null check (transaction_type in (
    'deposit_paystub',
    'deposit_manual',
    'withdrawal_filing',
    'withdrawal_manual',
    'balance_correction'
  )),
  -- Deposits are positive; withdrawals are negative; corrections can be either.
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

-- ── Settings additions for reconciliation ─────────────────────────────────
-- hysa_actual_balance     : most recent admin-entered actual bank balance
-- hysa_actual_balance_at  : timestamp of that entry (for "last reconciled" display)
alter table public.settings
  add column if not exists hysa_actual_balance    numeric(10,2),
  add column if not exists hysa_actual_balance_at timestamptz;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.hysa_transactions enable row level security;

create policy "Admins full access to hysa_transactions"
  on public.hysa_transactions
  for all using (public.is_admin());

-- ── Audit trigger ─────────────────────────────────────────────────────────
create trigger audit_hysa_transactions
  after insert or update or delete on public.hysa_transactions
  for each row execute procedure public.audit_trigger();

-- ── Backfill ──────────────────────────────────────────────────────────────
-- Insert deposit_paystub transactions for every paystub already marked as
-- HYSA-transferred. Amount = sum of all stored withholding + employer tax
-- columns, which is exactly what hysaAmountForStub() computes in TypeScript.
insert into public.hysa_transactions (
  transaction_type,
  amount,
  paystub_id,
  effective_date,
  notes,
  actor_id
)
select
  'deposit_paystub',
  round((
    coalesce(federal_withholding,    0) +
    coalesce(fica_social_security,   0) +
    coalesce(fica_medicare,          0) +
    coalesce(state_withholding,      0) +
    coalesce(sdi,                    0) +
    coalesce(pfl,                    0) +
    coalesce(employer_fica_ss,       0) +
    coalesce(employer_fica_medicare, 0) +
    coalesce(futa,                   0) +
    coalesce(suta,                   0)
  )::numeric, 2),
  id,
  coalesce(hysa_transferred_at::date, pay_date),
  'Backfilled by Phase 5 migration',
  created_by
from public.paystubs
where hysa_transferred = true;
