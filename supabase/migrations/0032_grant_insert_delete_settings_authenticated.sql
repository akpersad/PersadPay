-- settings table was missing INSERT for the authenticated role, causing
-- upsert (POST /rest/v1/settings) to return 403 even for admin users.
-- RLS policy (is_admin()) still enforces that only admins can write.
grant insert, delete on public.settings to authenticated;
