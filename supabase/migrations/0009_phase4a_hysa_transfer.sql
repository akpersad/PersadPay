-- Phase 4a follow-up — HYSA transfer tracking
-- Source: /docs/ROADMAP.md Phase 4a
--
-- Tracks whether the admin has moved the per-stub tax-and-withholding cash
-- to the high-yield savings account that holds it until the quarterly /
-- annual filings are paid. The amount is derived (sum of all employee-side
-- withholdings + employer-side taxes on the stub) so we don't store it.

alter table public.paystubs
  add column if not exists hysa_transferred    boolean not null default false,
  add column if not exists hysa_transferred_at timestamptz,
  add column if not exists hysa_notes          text;
