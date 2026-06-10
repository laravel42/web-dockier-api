-- Grant privileges on pm_integrations to service_role and authenticated
-- Required for PostgREST access via Supabase client
GRANT ALL ON public.pm_integrations TO service_role;
GRANT SELECT ON public.pm_integrations TO authenticated;
