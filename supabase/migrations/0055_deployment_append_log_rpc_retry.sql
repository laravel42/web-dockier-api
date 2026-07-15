-- Re-apply append_deployment_log in case 0054 was tracked but not executed.
-- deployments.id is text, so the parameter must be text (not uuid).
CREATE OR REPLACE FUNCTION public.append_deployment_log(p_deployment_id text, p_line text)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE deployments
  SET logs = COALESCE(logs, '') || p_line || E'\n'
  WHERE id = p_deployment_id;
$$;
