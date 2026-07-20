-- Audit 2026-07-18 item 35: MAX(stub_number)+1 reassigns the tail number when
-- the newest stub is deleted, contradicting the "stub numbers are never
-- reused" guarantee. A sequence is a true high-water counter — it only moves
-- forward, so a deleted tail number stays retired. (An aborted insert can
-- burn a number; that's fine, gaps are permanent by design.)

create sequence if not exists public.paystubs_stub_number_seq owned by public.paystubs.stub_number;

-- Seed to the current high-water mark. is_called=true makes the next nextval
-- return max+1; an empty table starts at 1.
do $$
declare m integer;
begin
  select coalesce(max(stub_number), 0) into m from public.paystubs;
  if m > 0 then
    perform setval('public.paystubs_stub_number_seq', m, true);
  else
    perform setval('public.paystubs_stub_number_seq', 1, false);
  end if;
end $$;

-- Same signature as before; the exclusive table lock is no longer needed —
-- nextval is atomic on its own.
create or replace function public.next_paystub_number()
  returns integer
  language sql
  security definer
  as $$
    select nextval('public.paystubs_stub_number_seq')::integer
  $$;
