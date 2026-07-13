-- Atomic append to deployment logs to avoid read-modify-write race conditions.
CREATE OR REPLACE FUNCTION public.append_deployment_log(p_deployment_id uuid, p_line text)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE deployments
  SET logs = COALESCE(logs, '') || p_line || E'\n'
  WHERE id = p_deployment_id;
$$;
