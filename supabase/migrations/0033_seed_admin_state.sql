CREATE OR REPLACE FUNCTION public.seed_admin_state(
  _user_id UUID,
  _email TEXT,
  _display_name TEXT,
  _organization_name TEXT,
  _organization_slug TEXT
)
RETURNS TABLE (
  organization_id UUID,
  organization_slug TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_email TEXT;
  v_name TEXT;
  v_org_name TEXT;
  v_org_slug TEXT;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'seed_admin_state: _user_id is required';
  END IF;

  v_email := lower(trim(coalesce(_email, '')));
  IF v_email = '' THEN
    RAISE EXCEPTION 'seed_admin_state: _email is required';
  END IF;

  v_name := NULLIF(trim(coalesce(_display_name, '')), '');
  IF v_name IS NULL THEN
    v_name := split_part(v_email, '@', 1);
  END IF;

  v_org_name := NULLIF(trim(coalesce(_organization_name, '')), '');
  IF v_org_name IS NULL THEN
    v_org_name := 'Dockier';
  END IF;

  v_org_slug := lower(trim(coalesce(_organization_slug, '')));
  IF v_org_slug = '' THEN
    v_org_slug := 'dockier';
  END IF;

  INSERT INTO public.organizations (name, slug, created_by)
  VALUES (v_org_name, v_org_slug, _user_id)
  ON CONFLICT (slug)
  DO UPDATE SET
    name = EXCLUDED.name
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_memberships (organization_id, user_id, role)
  VALUES (v_org_id, _user_id, 'admin')
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET
    role = EXCLUDED.role;

  INSERT INTO public.profiles (id, email, display_name, updated_at)
  VALUES (_user_id, v_email, v_name, NOW())
  ON CONFLICT (id)
  DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    updated_at = NOW();

  INSERT INTO public.users (
    id,
    email,
    name,
    organization_id,
    role,
    created_at,
    updated_at
  )
  VALUES (
    _user_id::text,
    v_email,
    v_name,
    v_org_id,
    'admin',
    NOW(),
    NOW()
  )
  ON CONFLICT (id)
  DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    organization_id = EXCLUDED.organization_id,
    role = EXCLUDED.role,
    updated_at = NOW();

  RETURN QUERY SELECT v_org_id, v_org_slug;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_admin_state(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_admin_state(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
