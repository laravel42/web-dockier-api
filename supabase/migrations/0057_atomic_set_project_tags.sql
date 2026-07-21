-- Atomic replace of project tag assignments.
-- Validates that all tag IDs belong to the tenant, deletes existing assignments,
-- and inserts the new set in a single transaction.
-- Returns the assigned tag rows for the response.

CREATE OR REPLACE FUNCTION public.set_project_tags(
  p_organization_id UUID,
  p_project_id TEXT,
  p_tag_ids UUID[]
)
RETURNS SETOF project_tags
LANGUAGE plpgsql
AS $$
DECLARE
  v_valid_count INT;
  v_expected_count INT;
BEGIN
  v_expected_count := array_length(p_tag_ids, 1);

  -- If no tags provided, just delete all and return empty
  IF v_expected_count IS NULL OR v_expected_count = 0 THEN
    DELETE FROM project_tag_assignments
    WHERE organization_id = p_organization_id
      AND project_id = p_project_id;
    RETURN;
  END IF;

  -- Verify all tag IDs belong to this organization
  SELECT count(*) INTO v_valid_count
  FROM project_tags
  WHERE id = ANY(p_tag_ids)
    AND organization_id = p_organization_id;

  IF v_valid_count <> v_expected_count THEN
    RAISE EXCEPTION 'One or more tags not found'
      USING ERRCODE = 'P0002'; -- no_data_found
  END IF;

  -- Delete existing assignments
  DELETE FROM project_tag_assignments
  WHERE organization_id = p_organization_id
    AND project_id = p_project_id;

  -- Insert new assignments
  INSERT INTO project_tag_assignments (organization_id, project_id, tag_id)
  SELECT p_organization_id, p_project_id, unnest(p_tag_ids)
  ON CONFLICT (project_id, tag_id) DO NOTHING;

  -- Return the assigned tags
  RETURN QUERY
  SELECT pt.*
  FROM project_tags pt
  WHERE pt.id = ANY(p_tag_ids)
    AND pt.organization_id = p_organization_id
  ORDER BY pt.name ASC;
END;
$$;
