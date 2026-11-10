-- Supabase advisor warnings 0011 (mutable search_path) and 0028 (anon can run SECURITY DEFINER).

-- Both are called only by the backend (secret key). Pinning the search_path changes nothing
-- for them: every table they touch lives in `public`.
ALTER FUNCTION public.append_deployment_log(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.set_project_tags(uuid, text, uuid[]) SET search_path = public, pg_temp;

-- RLS helpers from 0036. They only answer "is auth.uid() a member", so anon can never get a
-- true; it has no reason to reach them through /rest/v1/rpc. `authenticated` keeps EXECUTE
-- on purpose: the org-scoped policies call these helpers, and revoking it would turn any
-- future direct client read into a permission error instead of a filtered result.
REVOKE EXECUTE ON FUNCTION public.is_member_of(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_member_of_text(text) FROM PUBLIC, anon;
