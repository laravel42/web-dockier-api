-- Supabase advisor `rls_disabled_in_public`: tables in `public` are exposed through
-- PostgREST, so without RLS anyone holding the anon key can read and write them.
--
-- Enabling RLS with no policy denies anon/authenticated entirely. Dockier is unaffected:
-- the backend talks to Supabase with the secret key and to Postgres through
-- DATABASE_URL as the table owner, and both bypass RLS. pg-boss lives in the
-- `pgboss` schema, which this does not touch. The frontend never calls Supabase directly.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;
