-- Add deposit_interest as a valid HYSA transaction type.
-- deposit_interest covers bank interest posted to the HYSA account; it is a
-- positive-amount deposit like deposit_manual but semantically distinct so it
-- shows its own label/badge in the ledger UI.

-- Drop the inline transaction_type check (auto-named by Postgres)
alter table public.hysa_transactions
  drop constraint if exists hysa_transactions_transaction_type_check;

-- Drop the named amount-sign constraint so we can recreate it with the new type
alter table public.hysa_transactions
  drop constraint if exists hysa_amount_sign;

-- Recreate transaction_type check including deposit_interest
alter table public.hysa_transactions
  add constraint hysa_transactions_transaction_type_check
  check (transaction_type in (
    'deposit_paystub',
    'deposit_manual',
    'deposit_interest',
    'withdrawal_filing',
    'withdrawal_manual',
    'balance_correction'
  ));

-- Recreate amount-sign constraint: deposit_interest is positive like other deposits
alter table public.hysa_transactions
  add constraint hysa_amount_sign check (
    (transaction_type in ('deposit_paystub', 'deposit_manual', 'deposit_interest') and amount > 0)
    or (transaction_type in ('withdrawal_filing', 'withdrawal_manual') and amount < 0)
    or (transaction_type = 'balance_correction')
  );
