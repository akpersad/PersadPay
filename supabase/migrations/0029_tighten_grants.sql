-- Tighten over-broad table grants. RLS already enforces row-level access;
-- these revocations add defense-in-depth at the table-privilege layer.

-- settings: single-row, never re-inserted or deleted by clients
revoke insert, delete on public.settings from authenticated;

-- onboarding_checklist: pre-seeded items; clients only UPDATE (mark complete)
revoke insert, delete on public.onboarding_checklist from authenticated;

-- tax_rates: updated only via migrations; clients SELECT only
revoke insert, update, delete on public.tax_rates from authenticated;

-- reminders: never hard-deleted (dismissed flag used instead); INSERT retained for dismiss-and-roll-forward
revoke delete on public.reminders from authenticated;
