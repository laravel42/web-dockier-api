-- One round trip for the Security Scans list: per project, its newest scan, its newest
-- completed scan and how many scans it has. The page otherwise needs one listScans
-- request per project, since a single tenant-wide page lets a busy project crowd out
-- the others.
--
-- Read-only. Scoped by p_organization_id, which the backend passes from the
-- authenticated tenant. A project id from another tenant yields count 0 and nulls.
CREATE OR REPLACE FUNCTION public.latest_scans_for_projects(
  p_organization_id TEXT,
  p_project_ids TEXT[]
)
RETURNS TABLE (project_id TEXT, scan_count BIGINT, latest JSONB, latest_completed JSONB)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id,
    (SELECT count(*) FROM scans s
      WHERE s.organization_id = p_organization_id AND s.project_id = p.id),
    (SELECT to_jsonb(s) FROM scans s
      WHERE s.organization_id = p_organization_id AND s.project_id = p.id
      ORDER BY s.updated_at DESC LIMIT 1),
    (SELECT to_jsonb(s) FROM scans s
      WHERE s.organization_id = p_organization_id AND s.project_id = p.id AND s.status = 'completed'
      ORDER BY s.updated_at DESC LIMIT 1)
  FROM unnest(p_project_ids) AS p(id);
$$;

-- PostgREST exposes public functions at /rest/v1/rpc. This one takes the tenant as an
-- argument, so anything but the backend's secret key must not be able to call it.
REVOKE EXECUTE ON FUNCTION public.latest_scans_for_projects(text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.latest_scans_for_projects(text, text[]) TO service_role;
