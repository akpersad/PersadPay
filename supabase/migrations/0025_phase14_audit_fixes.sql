-- Phase 14.6 — Revoke stray INSERT grant on audit_log from authenticated role.
-- The audit_trigger() function runs as SECURITY DEFINER (postgres), so
-- revoking direct INSERT from authenticated does not affect trigger writes.
revoke insert on public.audit_log from authenticated;

-- Phase 14.7 — Add audit triggers to reminders table.
-- Mirrors the pattern established in 0003_phase2_line_items_and_audit.sql.
-- Allows tracing reminder dismissals and auto-created follow-up rows.
create trigger reminders_audit
  after insert or update or delete on public.reminders
  for each row execute function public.audit_trigger();
