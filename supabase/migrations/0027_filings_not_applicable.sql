-- 0027 — filings.not_applicable + reason
--
-- Why: Q1 NYS-45 / Q1 1040-ES are overdue but irrelevant for this household
-- (babysitter started 2026-05-11, after Q1 2026 ended). Without an explicit
-- N/A status, the admin would have to either lie and "Mark filed" or live
-- with a permanent red Overdue badge. Phase 2 fix from
-- docs/AUDIT_WORK_PLAN.md ("Mark Not Applicable" filings card item).

alter table public.filings
  add column if not exists not_applicable boolean not null default false,
  add column if not exists not_applicable_reason text;

-- Filed and N/A are mutually exclusive states. Pending = both fields default.
alter table public.filings
  drop constraint if exists filings_status_exclusivity;
alter table public.filings
  add constraint filings_status_exclusivity check (
    not (filed_on is not null and not_applicable = true)
  );

comment on column public.filings.not_applicable is
  'True when the filing is permanently irrelevant for this household (e.g., quarter prior to first stub). Mutually exclusive with filed_on. Suppresses the Overdue badge on the filings list and on the dashboard NextFilingCard.';
comment on column public.filings.not_applicable_reason is
  'Optional free-text explanation shown next to the Not applicable badge.';
