-- Atomic role permission replacement.
-- Deletes existing permissions and inserts new ones in a single transaction.
CREATE OR REPLACE FUNCTION public.replace_role_permissions(
  _role_id TEXT,
  _permission_ids TEXT[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete all existing permissions for this role
  DELETE FROM role_permissions WHERE role_id = _role_id;

  -- Insert new permissions
  IF array_length(_permission_ids, 1) > 0 THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT _role_id, unnest(_permission_ids);
  END IF;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replace_role_permissions(TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_role_permissions(TEXT, TEXT[]) TO service_role;
