-- paystubs_with_tax_year ran with owner (postgres) privileges, bypassing RLS:
-- any authenticated user with SELECT on the view could read every paystub row
-- including admin-only fields (zelle_transaction_id, employer taxes).
-- security_invoker makes the view run with the caller's privileges so the
-- paystubs RLS policies apply to queries through the view.
alter view public.paystubs_with_tax_year set (security_invoker = true);
