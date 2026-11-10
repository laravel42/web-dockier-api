-- Enable RLS on every table created in `public` from now on (the gap 0082 closed for
-- existing tables). Without it a new table is readable and writable with the anon key.
-- Mirrors Supabase's "Automatically enable RLS for new tables" trigger, kept here so a
-- fresh environment gets it too.
--
-- Best-effort by design: a failure is logged and never blocks the CREATE TABLE.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS EVENT_TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table', 'partitioned table')
      AND schema_name = 'public'
  LOOP
    BEGIN
      SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
      EXECUTE format('ALTER TABLE IF EXISTS %I.%I ENABLE ROW LEVEL SECURITY', cmd.schema_name, tbl);
      RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
    END;
  END LOOP;
END;
$$;

-- An event-trigger function cannot be called directly, but it sits in an API-exposed
-- schema; remove the default EXECUTE so the Advisor has nothing to flag.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

DROP EVENT TRIGGER IF EXISTS ensure_rls;

CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();
