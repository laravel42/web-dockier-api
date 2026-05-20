-- Atomic ownership transfer function.
-- Ensures both updates (remove from current, set on target) happen in a single transaction.
CREATE OR REPLACE FUNCTION public.transfer_ownership(
  _organization_id UUID,
  _current_owner_id UUID,
  _new_owner_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove owner flag from current owner
  UPDATE organization_memberships
  SET is_owner = false
  WHERE organization_id = _organization_id
    AND user_id = _current_owner_id
    AND is_owner = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Current user is not the owner of this organization';
  END IF;

  -- Set owner flag on new owner
  UPDATE organization_memberships
  SET is_owner = true
  WHERE organization_id = _organization_id
    AND user_id = _new_owner_id
    AND status = 'active';

  IF NOT FOUND THEN
    -- Rollback: restore current owner since target wasn't found
    UPDATE organization_memberships
    SET is_owner = true
    WHERE organization_id = _organization_id
      AND user_id = _current_owner_id;
    RAISE EXCEPTION 'Target user is not an active member of this organization';
  END IF;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transfer_ownership(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_ownership(UUID, UUID, UUID) TO service_role;
