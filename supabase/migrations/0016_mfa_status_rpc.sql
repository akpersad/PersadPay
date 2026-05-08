-- Returns the set of user IDs that have a verified TOTP MFA factor.
-- SECURITY DEFINER with search_path allows querying auth.mfa_factors
-- from application code without exposing the auth schema directly.
CREATE OR REPLACE FUNCTION public.get_verified_mfa_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT DISTINCT user_id
  FROM auth.mfa_factors
  WHERE status = 'verified';
$$;

-- Only admins (service role) should call this.
REVOKE ALL ON FUNCTION public.get_verified_mfa_user_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_verified_mfa_user_ids() TO service_role;
