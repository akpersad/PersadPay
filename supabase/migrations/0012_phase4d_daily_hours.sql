-- Phase 4d: persist per-day hours breakdown so the in-app calendar can show
-- day-by-day worked hours retroactively, and so the DBL/PFL coverage watch can
-- count real days instead of using a stub-count proxy.
--
-- Structure: { "2026-05-05": 9, "2026-05-06": 0, ... }
-- Only present on stubs created (or edited) with daily-entry mode. NULL for
-- stubs created in total-hours mode and for all historical stubs.

alter table public.paystubs
  add column if not exists daily_hours jsonb default null;
