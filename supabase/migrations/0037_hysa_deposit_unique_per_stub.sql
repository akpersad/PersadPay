-- Audit 2026-07-18 item 8: the HYSA edit-note dialog used to insert a fresh
-- deposit_paystub ledger row on every Update click, inflating the reserve
-- balance. The UI now inserts only on the first transfer; this partial unique
-- index is the DB backstop so a stub can never carry two ledger deposits
-- (verified 2026-07-18: no duplicates exist in live data).
create unique index if not exists hysa_transactions_one_deposit_per_stub
  on public.hysa_transactions (paystub_id)
  where transaction_type = 'deposit_paystub';
