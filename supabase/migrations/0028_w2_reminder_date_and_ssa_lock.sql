-- 12a: W-2/W-3 reminder due date — Jan 31 2027 is a Sunday; actual deadline is Feb 1 2027
-- (IRC § 7503 shifts federal deadlines falling on weekends to the next business day)
update public.reminders
set due_date = '2027-02-01'
where title like 'W-2 / W-3%'
  and due_date = '2027-01-31';

-- 9f: Add filed_with_ssa flag to w2s — locks regeneration after the W-2 has been filed
-- with SSA. Once true, the UI warns before allowing a replace.
alter table public.w2s
  add column if not exists filed_with_ssa boolean not null default false,
  add column if not exists filed_with_ssa_at timestamptz;
