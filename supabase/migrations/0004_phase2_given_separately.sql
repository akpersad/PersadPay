-- Phase 2 follow-up — Per-item "given separately" flag
-- Source: /docs/ROADMAP.md Phase 2
--
-- Adds a boolean to paystub_line_items so the admin can mark items that were
-- handed to the employee outside of the regular Zelle payment (e.g., a gift
-- card given in person, a holiday bonus paid in cash separately). The stub UI
-- subtracts these from net pay to display "Cash to send via Zelle."

alter table public.paystub_line_items
  add column if not exists given_separately boolean not null default false;
