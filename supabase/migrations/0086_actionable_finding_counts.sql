-- Finding counts computed in the database, one row per scan.
--
-- The counts were built by selecting every finding row and tallying in Node. PostgREST
-- returns at most 1000 rows per request, so past that the rest were silently dropped:
-- the 20 scans on the dashboard held 2362 findings, and a scan whose rows fell off the
-- end was reported as 0 findings — "Clean" — with 63 real ones.
--
-- Grouped by rule_id (not provider) so the provider mapping stays in one place, Node's
-- findingProvider(). One row per scan keeps the result far under the row cap.
-- The filter mirrors restrictToActionableFindings() in code-analysis/domain/findings.ts.
CREATE OR REPLACE FUNCTION public.actionable_finding_counts(p_scan_ids TEXT[])
RETURNS TABLE (scan_id TEXT, counts JSONB, distinct_files BIGINT)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH actionable AS (
    SELECT f.scan_id, f.rule_id, f.severity, f.file_path
    FROM findings f
    WHERE f.scan_id = ANY(p_scan_ids)
      AND f.suppressed_by_llm = false
      AND f.rule_id NOT LIKE 'sensitive-data.%'
  ),
  grouped AS (
    SELECT a.scan_id, a.rule_id, a.severity, count(*) AS n
    FROM actionable a
    GROUP BY a.scan_id, a.rule_id, a.severity
  )
  SELECT
    g.scan_id,
    jsonb_agg(jsonb_build_object('rule_id', g.rule_id, 'severity', g.severity, 'n', g.n)),
    (SELECT count(DISTINCT a.file_path) FROM actionable a WHERE a.scan_id = g.scan_id AND a.file_path <> '')
  FROM grouped g
  GROUP BY g.scan_id;
$$;

-- Called only by the backend with the secret key; nothing else reaches it through /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.actionable_finding_counts(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actionable_finding_counts(text[]) TO service_role;
