-- BACKFILL of remote migration `phase1_schema_additions` (version
-- 20260509213351, applied to prod 2026-05-09 via MCP apply_migration; no
-- local file existed until the 2026-07-18 audit flagged the gap). Content is
-- verbatim from supabase_migrations.schema_migrations, except the two CREATE
-- POLICY statements gained drop-if-exists guards so a fresh replay stays
-- idempotent (the policies already exist in prod).

-- Add stub email tracking columns
ALTER TABLE public.paystubs
  ADD COLUMN IF NOT EXISTS resend_message_id text,
  ADD COLUMN IF NOT EXISTS stub_sent_at timestamptz;

-- Add followup email flag to reminders
ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS followup_email_sent boolean NOT NULL DEFAULT false;

-- Block deletion of paystubs once payment has been sent.
-- Restrictive policy means ALL policies must pass for delete to succeed —
-- even admin's "full access" policy cannot override this.
DROP POLICY IF EXISTS "no_delete_paid_stubs" ON public.paystubs;
CREATE POLICY "no_delete_paid_stubs" ON public.paystubs
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (payment_sent = false);

-- Allow employees to SELECT from tax_rates so getTaxRatesForYear() works
-- in their session when rendering stub details or the generation form.
DROP POLICY IF EXISTS "Employees read tax_rates" ON public.tax_rates;
CREATE POLICY "Employees read tax_rates" ON public.tax_rates
  FOR SELECT
  USING (NOT public.is_admin());
