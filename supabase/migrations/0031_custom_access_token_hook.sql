CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb;
  user_roles_arr jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(role::text), '[]'::jsonb)
  INTO user_roles_arr
  FROM public.user_roles
  WHERE user_id = (event->>'user_id')::uuid;

  claims := event->'claims';
  claims := jsonb_set(claims, '{user_roles}', user_roles_arr);
  claims := jsonb_set(claims, '{is_admin}',
    to_jsonb(EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = (event->>'user_id')::uuid AND role = 'admin'
    ))
  );

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT ALL ON TABLE public.user_roles TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
