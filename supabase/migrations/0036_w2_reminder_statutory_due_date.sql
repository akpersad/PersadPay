-- Audit 2026-07-18 item 7: store STATUTORY due dates on reminders; weekend/holiday
-- shifting happens at display time via shiftedDeadline() (dates.ts).
--
-- Migration 0028 stored the shifted 2027-02-01 (Jan 31 2027 is a Sunday) directly
-- on the W-2/W-3 reminder. Roll-forward keeps the month-day, so the 2028 successor
-- would show Feb 1 when the real deadline is Mon Jan 31, 2028 — an SSA late-filing
-- exposure. Revert to the statutory Jan 31; the UI already renders
-- "Due Feb 1, 2027 (shifted from Jan 31, 2027)".
update public.reminders
set due_date = '2027-01-31'
where title like 'W-2 / W-3%'
  and due_date = '2027-02-01';
