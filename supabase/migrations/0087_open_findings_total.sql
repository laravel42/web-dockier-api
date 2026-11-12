-- The dashboard's "Findings" KPI: actionable findings in each project's latest
-- completed scan, summed over the tenant. That is what is open right now, without
-- counting the same unfixed finding once per re-scan.
--
-- It used to be summed client-side over the newest 20 scans, so it was both partial
-- (projects outside those 20 were missing) and inflated (a project scanned twice
-- counted twice). One scalar per tenant, so no row cap applies.
--
-- "Latest completed" is the same choice latest_scans_for_projects (0085) makes, and
-- the filter mirrors actionable_finding_counts (0086).
CREATE OR REPLACE FUNCTION public.open_findings_total(p_organization_id TEXT)
RETURNS BIGINT
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (s.project_id) s.id
    FROM scans s
    WHERE s.organization_id = p_organization_id AND s.status = 'completed'
    ORDER BY s.project_id, s.updated_at DESC
  )
  SELECT count(*)
  FROM latest l
  JOIN findings f ON f.scan_id = l.id
  WHERE f.suppressed_by_llm = false
    AND f.rule_id NOT LIKE 'sensitive-data.%';
$$;

-- Takes the tenant as an argument: only the backend's secret key may call it.
REVOKE EXECUTE ON FUNCTION public.open_findings_total(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_findings_total(text) TO service_role;
