-- Audit 2026-07-18 item 20: regenerating a W-2 that was already filed with the
-- SSA silently kept filed_with_ssa = true, showing a green "Filed with SSA"
-- badge on numbers the SSA never received. Track the discrepancy explicitly:
-- needs_w2c flips true when a filed W-2 is regenerated with different box
-- values, and clears when the admin marks the (corrected) W-2 filed again.
alter table public.w2s
  add column if not exists needs_w2c boolean not null default false;

comment on column public.w2s.needs_w2c is
  'True when this W-2 was regenerated with different amounts after being filed with the SSA. A Form W-2c must be filed; cleared on the next Mark Filed w/ SSA.';
