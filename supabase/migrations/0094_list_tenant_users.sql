-- Users of a tenant, by membership.
--
-- listUsers filtered users.organization_id, which is ONE value per person: the
-- organization they last signed in to. Someone who belongs to two organizations
-- (anyone who creates a second one with POST /auth/tenants) was missing from the
-- other one's Users list, and could not be edited from it. A tenant's users are
-- those with an active membership in it, plus the ones this tenant created that
-- have no role yet (users.organization_id = tenant, no membership), so an admin can
-- still give them one.
--
-- Called only by the backend (service role). Search is a plain substring match, not
-- a LIKE pattern, so % and _ in a name need no escaping.
CREATE OR REPLACE FUNCTION public.list_tenant_users(
  p_tenant uuid,
  p_search text,
  p_limit integer,
  p_offset integer
)
RETURNS TABLE (
  id text,
  email text,
  name text,
  avatar_url text,
  country text,
  language text,
  timezone text,
  organization_id uuid,
  created_at timestamp without time zone,
  total_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.email, u.name, u.avatar_url, u.country, u.language, u.timezone,
         u.organization_id, u.created_at, count(*) OVER ()
  FROM users u
  WHERE (
      u.organization_id = p_tenant
      OR EXISTS (
        SELECT 1 FROM organization_memberships m
        WHERE m.organization_id = p_tenant
          AND m.user_id::text = u.id
          AND m.status = 'active'
      )
    )
    AND (
      coalesce(p_search, '') = ''
      OR strpos(lower(u.name), lower(p_search)) > 0
      OR strpos(lower(u.email), lower(p_search)) > 0
    )
  ORDER BY u.created_at DESC, u.id
  LIMIT p_limit OFFSET p_offset
$$;

REVOKE EXECUTE ON FUNCTION public.list_tenant_users(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_users(uuid, text, integer, integer) TO service_role;
