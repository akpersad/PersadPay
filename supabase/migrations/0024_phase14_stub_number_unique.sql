-- Phase 14.1 — UNIQUE constraint + atomic stub_number assignment
-- Guarantees no two stubs share a number even under concurrent inserts.
-- The BEFORE INSERT trigger overwrites any client-supplied stub_number with
-- a locked MAX()+1, making the client value advisory only.

-- 1. Unique constraint (safe to add — no duplicates exist)
alter table public.paystubs
  add constraint paystubs_stub_number_unique unique (stub_number);

-- 2. Atomic next-number function (table-level lock prevents races)
create or replace function public.next_paystub_number()
  returns integer
  language plpgsql
  security definer
  as $$
declare
  next_num integer;
begin
  lock table public.paystubs in exclusive mode;
  select coalesce(max(stub_number), 0) + 1 into next_num from public.paystubs;
  return next_num;
end;
$$;

-- 3. Trigger function that assigns the locked value
create or replace function public.assign_stub_number()
  returns trigger
  language plpgsql
  as $$
begin
  new.stub_number := public.next_paystub_number();
  return new;
end;
$$;

-- 4. Attach trigger — fires before every INSERT, overwriting stub_number
create trigger paystubs_assign_stub_number
  before insert on public.paystubs
  for each row execute function public.assign_stub_number();
