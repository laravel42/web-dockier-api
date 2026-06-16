-- Allow deletion of Member and custom roles; Admin remains non-deletable.
UPDATE roles
SET is_deletable = true
WHERE deleted_at IS NULL
  AND system_key IS DISTINCT FROM 'admin'
  AND is_deletable = false;
