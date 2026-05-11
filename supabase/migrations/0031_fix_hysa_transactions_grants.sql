-- hysa_transactions was created without authenticated grants; RLS already restricts to admins only
grant select, insert, update, delete on public.hysa_transactions to authenticated;
