-- Browsers never talk to Postgres: the frontend has no supabase-js, and every read and
-- write goes through the backend with the service role. The anon and authenticated
-- roles therefore need no write access at all, and keeping it was a hole: the policy
-- "Users can update themselves" (0036) let a signed-in user rewrite their OWN users row
-- over PostgREST with only the public key, including two_factor_enabled, the recovery
-- code hashes, two_factor_last_counter and organization_id. Turning 2FA off that way
-- leaves the email code as the only sign-in factor.
--
-- Supabase grants anon/authenticated ALL on every table by default and relies on RLS to
-- hold them back. That is one missing policy away from a leak, so the grants go instead.
-- authenticated keeps SELECT (the org-scoped read policies of 0036 stay as a second
-- layer); anon keeps nothing. service_role is untouched.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Tables created from now on must not get the grants back. Each owner has its own
-- default ACL; supabase_admin's may be out of reach of the migration role, which is
-- not an error worth failing the migration for.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;
DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not change supabase_admin default privileges; tables it creates keep the Supabase defaults.';
END $$;

-- The write policies are now unreachable; drop them so nothing reads as permission.
DROP POLICY IF EXISTS "Users can update themselves" ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
