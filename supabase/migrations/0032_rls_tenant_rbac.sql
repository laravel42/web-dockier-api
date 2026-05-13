-- RLS hardening for tenant isolation and membership RBAC.
-- Model:
-- - membership role is sourced from public.organization_memberships (admin/member)
-- - no authorization decisions rely on auth user metadata
-- - tenant-scoped tables enforce member read + admin write

CREATE OR REPLACE FUNCTION public.is_org_member(_org_id UUID, _user_id UUID DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(_user_id IS NOT NULL, false)
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships m
      WHERE m.organization_id = _org_id
        AND m.user_id = _user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id UUID, _user_id UUID DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(_user_id IS NOT NULL, false)
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships m
      WHERE m.organization_id = _org_id
        AND m.user_id = _user_id
        AND m.role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_app_member(_app_id TEXT, _user_id UUID DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _app_id IS NOT NULL
    AND _app_id <> ''
    AND COALESCE(_user_id IS NOT NULL, false)
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships m
      WHERE m.organization_id::text = _app_id
        AND m.user_id = _user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.is_app_admin(_app_id TEXT, _user_id UUID DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _app_id IS NOT NULL
    AND _app_id <> ''
    AND COALESCE(_user_id IS NOT NULL, false)
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships m
      WHERE m.organization_id::text = _app_id
        AND m.user_id = _user_id
        AND m.role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_project_member(_project_id TEXT, _user_id UUID DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _project_id IS NOT NULL
    AND _project_id <> ''
    AND COALESCE(_user_id IS NOT NULL, false)
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.organization_memberships m ON m.organization_id = p.organization_id
      WHERE p.id = _project_id
        AND m.user_id = _user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.is_project_admin(_project_id TEXT, _user_id UUID DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _project_id IS NOT NULL
    AND _project_id <> ''
    AND COALESCE(_user_id IS NOT NULL, false)
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.organization_memberships m ON m.organization_id = p.organization_id
      WHERE p.id = _project_id
        AND m.user_id = _user_id
        AND m.role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_connection_member(_connection_id TEXT, _user_id UUID DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _connection_id IS NOT NULL
    AND _connection_id <> ''
    AND COALESCE(_user_id IS NOT NULL, false)
    AND EXISTS (
      SELECT 1
      FROM public.git_connections c
      JOIN public.organization_memberships m ON m.organization_id::text = c.app_id
      WHERE c.id = _connection_id
        AND m.user_id = _user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.is_connection_admin(_connection_id TEXT, _user_id UUID DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _connection_id IS NOT NULL
    AND _connection_id <> ''
    AND COALESCE(_user_id IS NOT NULL, false)
    AND EXISTS (
      SELECT 1
      FROM public.git_connections c
      JOIN public.organization_memberships m ON m.organization_id::text = c.app_id
      WHERE c.id = _connection_id
        AND m.user_id = _user_id
        AND m.role = 'admin'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_org_member(UUID, UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(UUID, UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_app_member(TEXT, UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_app_admin(TEXT, UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_member(TEXT, UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_admin(TEXT, UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_connection_member(TEXT, UUID) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_connection_admin(TEXT, UUID) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.is_org_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_app_member(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_app_admin(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_member(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_admin(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_connection_member(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_connection_admin(TEXT, UUID) TO authenticated;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE git_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE stack_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE repo_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE stats_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensitive_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE opengrep_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sonarqube_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ssh_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_select_member ON organizations;
DROP POLICY IF EXISTS organizations_insert_any_auth ON organizations;
DROP POLICY IF EXISTS organizations_select_tenant_member ON organizations;
DROP POLICY IF EXISTS organizations_insert_authenticated ON organizations;
DROP POLICY IF EXISTS organizations_update_tenant_admin ON organizations;
DROP POLICY IF EXISTS organizations_delete_tenant_admin ON organizations;

CREATE POLICY organizations_select_tenant_member
ON organizations
FOR SELECT
TO authenticated
USING (public.is_org_member(id));

CREATE POLICY organizations_insert_authenticated
ON organizations
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (created_by IS NULL OR created_by = auth.uid())
);

CREATE POLICY organizations_update_tenant_admin
ON organizations
FOR UPDATE
TO authenticated
USING (public.is_org_admin(id))
WITH CHECK (public.is_org_admin(id));

CREATE POLICY organizations_delete_tenant_admin
ON organizations
FOR DELETE
TO authenticated
USING (public.is_org_admin(id));

DROP POLICY IF EXISTS organization_memberships_select_member ON organization_memberships;
DROP POLICY IF EXISTS organization_memberships_insert_admin ON organization_memberships;
DROP POLICY IF EXISTS organization_memberships_select_tenant_member ON organization_memberships;
DROP POLICY IF EXISTS organization_memberships_insert_tenant_admin ON organization_memberships;
DROP POLICY IF EXISTS organization_memberships_update_tenant_admin ON organization_memberships;
DROP POLICY IF EXISTS organization_memberships_delete_tenant_admin_or_self ON organization_memberships;

CREATE POLICY organization_memberships_select_tenant_member
ON organization_memberships
FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id));

CREATE POLICY organization_memberships_insert_tenant_admin
ON organization_memberships
FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY organization_memberships_update_tenant_admin
ON organization_memberships
FOR UPDATE
TO authenticated
USING (public.is_org_admin(organization_id))
WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY organization_memberships_delete_tenant_admin_or_self
ON organization_memberships
FOR DELETE
TO authenticated
USING (public.is_org_admin(organization_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS users_select_org_member ON users;
DROP POLICY IF EXISTS users_update_self_or_admin ON users;
DROP POLICY IF EXISTS users_select_tenant_member_or_self ON users;
DROP POLICY IF EXISTS users_insert_self_or_tenant_admin ON users;
DROP POLICY IF EXISTS users_update_self_or_tenant_admin ON users;
DROP POLICY IF EXISTS users_delete_self_or_tenant_admin ON users;

CREATE POLICY users_select_tenant_member_or_self
ON users
FOR SELECT
TO authenticated
USING (
  id = auth.uid()::text
  OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
);

CREATE POLICY users_insert_self_or_tenant_admin
ON users
FOR INSERT
TO authenticated
WITH CHECK (
  (id = auth.uid()::text AND (organization_id IS NULL OR public.is_org_member(organization_id)))
  OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
);

CREATE POLICY users_update_self_or_tenant_admin
ON users
FOR UPDATE
TO authenticated
USING (
  id = auth.uid()::text
  OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
)
WITH CHECK (
  id = auth.uid()::text
  OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
);

CREATE POLICY users_delete_self_or_tenant_admin
ON users
FOR DELETE
TO authenticated
USING (
  id = auth.uid()::text
  OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
);

DROP POLICY IF EXISTS social_connections_select_member_or_owner ON social_connections;
DROP POLICY IF EXISTS social_connections_insert_owner_or_admin ON social_connections;
DROP POLICY IF EXISTS social_connections_update_owner_or_admin ON social_connections;
DROP POLICY IF EXISTS social_connections_delete_owner_or_admin ON social_connections;

CREATE POLICY social_connections_select_member_or_owner
ON social_connections
FOR SELECT
TO authenticated
USING (user_id = auth.uid()::text OR public.is_app_member(app_id));

CREATE POLICY social_connections_insert_owner_or_admin
ON social_connections
FOR INSERT
TO authenticated
WITH CHECK (
  (user_id = auth.uid()::text AND public.is_app_member(app_id))
  OR public.is_app_admin(app_id)
);

CREATE POLICY social_connections_update_owner_or_admin
ON social_connections
FOR UPDATE
TO authenticated
USING (user_id = auth.uid()::text OR public.is_app_admin(app_id))
WITH CHECK (
  (user_id = auth.uid()::text AND public.is_app_member(app_id))
  OR public.is_app_admin(app_id)
);

CREATE POLICY social_connections_delete_owner_or_admin
ON social_connections
FOR DELETE
TO authenticated
USING (user_id = auth.uid()::text OR public.is_app_admin(app_id));

DROP POLICY IF EXISTS projects_select_org_member ON projects;
DROP POLICY IF EXISTS projects_write_org_admin ON projects;
DROP POLICY IF EXISTS projects_select_tenant_member ON projects;
DROP POLICY IF EXISTS projects_insert_tenant_admin ON projects;
DROP POLICY IF EXISTS projects_update_tenant_admin ON projects;
DROP POLICY IF EXISTS projects_delete_tenant_admin ON projects;

CREATE POLICY projects_select_tenant_member
ON projects
FOR SELECT
TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));

CREATE POLICY projects_insert_tenant_admin
ON projects
FOR INSERT
TO authenticated
WITH CHECK (organization_id IS NOT NULL AND public.is_org_admin(organization_id));

CREATE POLICY projects_update_tenant_admin
ON projects
FOR UPDATE
TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
WITH CHECK (organization_id IS NOT NULL AND public.is_org_admin(organization_id));

CREATE POLICY projects_delete_tenant_admin
ON projects
FOR DELETE
TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_admin(organization_id));

DROP POLICY IF EXISTS roles_select_tenant_member ON roles;
DROP POLICY IF EXISTS roles_insert_tenant_admin ON roles;
DROP POLICY IF EXISTS roles_update_tenant_admin ON roles;
DROP POLICY IF EXISTS roles_delete_tenant_admin ON roles;

CREATE POLICY roles_select_tenant_member
ON roles
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id));

CREATE POLICY roles_insert_tenant_admin
ON roles
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY roles_update_tenant_admin
ON roles
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id))
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY roles_delete_tenant_admin
ON roles
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id));

DROP POLICY IF EXISTS git_connections_select_tenant_member ON git_connections;
DROP POLICY IF EXISTS git_connections_insert_tenant_admin ON git_connections;
DROP POLICY IF EXISTS git_connections_update_tenant_admin ON git_connections;
DROP POLICY IF EXISTS git_connections_delete_tenant_admin ON git_connections;

CREATE POLICY git_connections_select_tenant_member
ON git_connections
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id));

CREATE POLICY git_connections_insert_tenant_admin
ON git_connections
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY git_connections_update_tenant_admin
ON git_connections
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id))
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY git_connections_delete_tenant_admin
ON git_connections
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id));

DROP POLICY IF EXISTS analysis_cache_select_tenant_member ON analysis_cache;
DROP POLICY IF EXISTS analysis_cache_insert_tenant_admin ON analysis_cache;
DROP POLICY IF EXISTS analysis_cache_update_tenant_admin ON analysis_cache;
DROP POLICY IF EXISTS analysis_cache_delete_tenant_admin ON analysis_cache;

CREATE POLICY analysis_cache_select_tenant_member
ON analysis_cache
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id) OR public.is_project_member(project_id));

CREATE POLICY analysis_cache_insert_tenant_admin
ON analysis_cache
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id) OR public.is_project_admin(project_id));

CREATE POLICY analysis_cache_update_tenant_admin
ON analysis_cache
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id) OR public.is_project_admin(project_id))
WITH CHECK (public.is_app_admin(app_id) OR public.is_project_admin(project_id));

CREATE POLICY analysis_cache_delete_tenant_admin
ON analysis_cache
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id) OR public.is_project_admin(project_id));

DROP POLICY IF EXISTS stack_cache_select_tenant_member ON stack_cache;
DROP POLICY IF EXISTS stack_cache_insert_tenant_admin ON stack_cache;
DROP POLICY IF EXISTS stack_cache_update_tenant_admin ON stack_cache;
DROP POLICY IF EXISTS stack_cache_delete_tenant_admin ON stack_cache;

CREATE POLICY stack_cache_select_tenant_member
ON stack_cache
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id) OR public.is_project_member(project_id));

CREATE POLICY stack_cache_insert_tenant_admin
ON stack_cache
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id) OR public.is_project_admin(project_id));

CREATE POLICY stack_cache_update_tenant_admin
ON stack_cache
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id) OR public.is_project_admin(project_id))
WITH CHECK (public.is_app_admin(app_id) OR public.is_project_admin(project_id));

CREATE POLICY stack_cache_delete_tenant_admin
ON stack_cache
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id) OR public.is_project_admin(project_id));

DROP POLICY IF EXISTS repo_cache_select_tenant_member ON repo_cache;
DROP POLICY IF EXISTS repo_cache_insert_tenant_admin ON repo_cache;
DROP POLICY IF EXISTS repo_cache_update_tenant_admin ON repo_cache;
DROP POLICY IF EXISTS repo_cache_delete_tenant_admin ON repo_cache;

CREATE POLICY repo_cache_select_tenant_member
ON repo_cache
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id) OR public.is_connection_member(connection_id));

CREATE POLICY repo_cache_insert_tenant_admin
ON repo_cache
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id) OR public.is_connection_admin(connection_id));

CREATE POLICY repo_cache_update_tenant_admin
ON repo_cache
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id) OR public.is_connection_admin(connection_id))
WITH CHECK (public.is_app_admin(app_id) OR public.is_connection_admin(connection_id));

CREATE POLICY repo_cache_delete_tenant_admin
ON repo_cache
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id) OR public.is_connection_admin(connection_id));

DROP POLICY IF EXISTS stats_cache_select_tenant_member ON stats_cache;
DROP POLICY IF EXISTS stats_cache_insert_tenant_admin ON stats_cache;
DROP POLICY IF EXISTS stats_cache_update_tenant_admin ON stats_cache;
DROP POLICY IF EXISTS stats_cache_delete_tenant_admin ON stats_cache;

CREATE POLICY stats_cache_select_tenant_member
ON stats_cache
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id) OR public.is_project_member(project_id));

CREATE POLICY stats_cache_insert_tenant_admin
ON stats_cache
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id) OR public.is_project_admin(project_id));

CREATE POLICY stats_cache_update_tenant_admin
ON stats_cache
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id) OR public.is_project_admin(project_id))
WITH CHECK (public.is_app_admin(app_id) OR public.is_project_admin(project_id));

CREATE POLICY stats_cache_delete_tenant_admin
ON stats_cache
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id) OR public.is_project_admin(project_id));

DROP POLICY IF EXISTS sensitive_cache_select_tenant_member ON sensitive_cache;
DROP POLICY IF EXISTS sensitive_cache_insert_tenant_admin ON sensitive_cache;
DROP POLICY IF EXISTS sensitive_cache_update_tenant_admin ON sensitive_cache;
DROP POLICY IF EXISTS sensitive_cache_delete_tenant_admin ON sensitive_cache;

CREATE POLICY sensitive_cache_select_tenant_member
ON sensitive_cache
FOR SELECT
TO authenticated
USING (public.is_project_member(project_id));

CREATE POLICY sensitive_cache_insert_tenant_admin
ON sensitive_cache
FOR INSERT
TO authenticated
WITH CHECK (public.is_project_admin(project_id));

CREATE POLICY sensitive_cache_update_tenant_admin
ON sensitive_cache
FOR UPDATE
TO authenticated
USING (public.is_project_admin(project_id))
WITH CHECK (public.is_project_admin(project_id));

CREATE POLICY sensitive_cache_delete_tenant_admin
ON sensitive_cache
FOR DELETE
TO authenticated
USING (public.is_project_admin(project_id));

DROP POLICY IF EXISTS scans_select_tenant_member ON scans;
DROP POLICY IF EXISTS scans_insert_tenant_admin ON scans;
DROP POLICY IF EXISTS scans_update_tenant_admin ON scans;
DROP POLICY IF EXISTS scans_delete_tenant_admin ON scans;

CREATE POLICY scans_select_tenant_member
ON scans
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id));

CREATE POLICY scans_insert_tenant_admin
ON scans
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY scans_update_tenant_admin
ON scans
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id))
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY scans_delete_tenant_admin
ON scans
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id));

DROP POLICY IF EXISTS findings_select_tenant_member ON findings;
DROP POLICY IF EXISTS findings_insert_tenant_admin ON findings;
DROP POLICY IF EXISTS findings_update_tenant_admin ON findings;
DROP POLICY IF EXISTS findings_delete_tenant_admin ON findings;

CREATE POLICY findings_select_tenant_member
ON findings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.scans s
    WHERE s.id = findings.scan_id
      AND public.is_app_member(s.app_id)
  )
);

CREATE POLICY findings_insert_tenant_admin
ON findings
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.scans s
    WHERE s.id = findings.scan_id
      AND public.is_app_admin(s.app_id)
  )
);

CREATE POLICY findings_update_tenant_admin
ON findings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.scans s
    WHERE s.id = findings.scan_id
      AND public.is_app_admin(s.app_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.scans s
    WHERE s.id = findings.scan_id
      AND public.is_app_admin(s.app_id)
  )
);

CREATE POLICY findings_delete_tenant_admin
ON findings
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.scans s
    WHERE s.id = findings.scan_id
      AND public.is_app_admin(s.app_id)
  )
);

DROP POLICY IF EXISTS custom_rules_select_tenant_member ON custom_rules;
DROP POLICY IF EXISTS custom_rules_insert_tenant_admin ON custom_rules;
DROP POLICY IF EXISTS custom_rules_update_tenant_admin ON custom_rules;
DROP POLICY IF EXISTS custom_rules_delete_tenant_admin ON custom_rules;

CREATE POLICY custom_rules_select_tenant_member
ON custom_rules
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id));

CREATE POLICY custom_rules_insert_tenant_admin
ON custom_rules
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY custom_rules_update_tenant_admin
ON custom_rules
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id))
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY custom_rules_delete_tenant_admin
ON custom_rules
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id));

DROP POLICY IF EXISTS opengrep_rules_select_tenant_member ON opengrep_rules;
DROP POLICY IF EXISTS opengrep_rules_insert_tenant_admin ON opengrep_rules;
DROP POLICY IF EXISTS opengrep_rules_update_tenant_admin ON opengrep_rules;
DROP POLICY IF EXISTS opengrep_rules_delete_tenant_admin ON opengrep_rules;

CREATE POLICY opengrep_rules_select_tenant_member
ON opengrep_rules
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id));

CREATE POLICY opengrep_rules_insert_tenant_admin
ON opengrep_rules
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY opengrep_rules_update_tenant_admin
ON opengrep_rules
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id))
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY opengrep_rules_delete_tenant_admin
ON opengrep_rules
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id));

DROP POLICY IF EXISTS sonarqube_rules_select_tenant_member ON sonarqube_rules;
DROP POLICY IF EXISTS sonarqube_rules_insert_tenant_admin ON sonarqube_rules;
DROP POLICY IF EXISTS sonarqube_rules_update_tenant_admin ON sonarqube_rules;
DROP POLICY IF EXISTS sonarqube_rules_delete_tenant_admin ON sonarqube_rules;

CREATE POLICY sonarqube_rules_select_tenant_member
ON sonarqube_rules
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id));

CREATE POLICY sonarqube_rules_insert_tenant_admin
ON sonarqube_rules
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY sonarqube_rules_update_tenant_admin
ON sonarqube_rules
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id))
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY sonarqube_rules_delete_tenant_admin
ON sonarqube_rules
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id));

DROP POLICY IF EXISTS notification_channels_select_tenant_member ON notification_channels;
DROP POLICY IF EXISTS notification_channels_insert_tenant_admin ON notification_channels;
DROP POLICY IF EXISTS notification_channels_update_tenant_admin ON notification_channels;
DROP POLICY IF EXISTS notification_channels_delete_tenant_admin ON notification_channels;

CREATE POLICY notification_channels_select_tenant_member
ON notification_channels
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id));

CREATE POLICY notification_channels_insert_tenant_admin
ON notification_channels
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY notification_channels_update_tenant_admin
ON notification_channels
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id))
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY notification_channels_delete_tenant_admin
ON notification_channels
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id));

DROP POLICY IF EXISTS notifications_select_tenant_member ON notifications;
DROP POLICY IF EXISTS notifications_insert_tenant_admin ON notifications;
DROP POLICY IF EXISTS notifications_update_tenant_admin ON notifications;
DROP POLICY IF EXISTS notifications_delete_tenant_admin ON notifications;

CREATE POLICY notifications_select_tenant_member
ON notifications
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id));

CREATE POLICY notifications_insert_tenant_admin
ON notifications
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY notifications_update_tenant_admin
ON notifications
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id))
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY notifications_delete_tenant_admin
ON notifications
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id));

DROP POLICY IF EXISTS server_providers_select_tenant_member ON server_providers;
DROP POLICY IF EXISTS server_providers_insert_tenant_admin ON server_providers;
DROP POLICY IF EXISTS server_providers_update_tenant_admin ON server_providers;
DROP POLICY IF EXISTS server_providers_delete_tenant_admin ON server_providers;

CREATE POLICY server_providers_select_tenant_member
ON server_providers
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id));

CREATE POLICY server_providers_insert_tenant_admin
ON server_providers
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY server_providers_update_tenant_admin
ON server_providers
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id))
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY server_providers_delete_tenant_admin
ON server_providers
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id));

DROP POLICY IF EXISTS deployments_select_tenant_member ON deployments;
DROP POLICY IF EXISTS deployments_insert_tenant_admin ON deployments;
DROP POLICY IF EXISTS deployments_update_tenant_admin ON deployments;
DROP POLICY IF EXISTS deployments_delete_tenant_admin ON deployments;

CREATE POLICY deployments_select_tenant_member
ON deployments
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id));

CREATE POLICY deployments_insert_tenant_admin
ON deployments
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY deployments_update_tenant_admin
ON deployments
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id))
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY deployments_delete_tenant_admin
ON deployments
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id));

DROP POLICY IF EXISTS "Authenticated can view ssh keys" ON ssh_keys;
DROP POLICY IF EXISTS ssh_keys_select_tenant_member ON ssh_keys;
DROP POLICY IF EXISTS ssh_keys_insert_tenant_admin ON ssh_keys;
DROP POLICY IF EXISTS ssh_keys_update_tenant_admin ON ssh_keys;
DROP POLICY IF EXISTS ssh_keys_delete_tenant_admin ON ssh_keys;

CREATE POLICY ssh_keys_select_tenant_member
ON ssh_keys
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id));

CREATE POLICY ssh_keys_insert_tenant_admin
ON ssh_keys
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY ssh_keys_update_tenant_admin
ON ssh_keys
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id))
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY ssh_keys_delete_tenant_admin
ON ssh_keys
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id));

DROP POLICY IF EXISTS builds_select_tenant_member ON builds;
DROP POLICY IF EXISTS builds_insert_tenant_admin ON builds;
DROP POLICY IF EXISTS builds_update_tenant_admin ON builds;
DROP POLICY IF EXISTS builds_delete_tenant_admin ON builds;

CREATE POLICY builds_select_tenant_member
ON builds
FOR SELECT
TO authenticated
USING (public.is_app_member(app_id));

CREATE POLICY builds_insert_tenant_admin
ON builds
FOR INSERT
TO authenticated
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY builds_update_tenant_admin
ON builds
FOR UPDATE
TO authenticated
USING (public.is_app_admin(app_id))
WITH CHECK (public.is_app_admin(app_id));

CREATE POLICY builds_delete_tenant_admin
ON builds
FOR DELETE
TO authenticated
USING (public.is_app_admin(app_id));

DROP POLICY IF EXISTS "Authenticated can view cloud providers" ON cloud_providers;
DROP POLICY IF EXISTS "Admins manage cloud providers insert" ON cloud_providers;
DROP POLICY IF EXISTS "Admins manage cloud providers update" ON cloud_providers;
DROP POLICY IF EXISTS "Admins manage cloud providers delete" ON cloud_providers;
DROP POLICY IF EXISTS cloud_providers_select_admin ON cloud_providers;
DROP POLICY IF EXISTS cloud_providers_insert_admin ON cloud_providers;
DROP POLICY IF EXISTS cloud_providers_update_admin ON cloud_providers;
DROP POLICY IF EXISTS cloud_providers_delete_admin ON cloud_providers;

CREATE POLICY cloud_providers_select_admin
ON cloud_providers
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY cloud_providers_insert_admin
ON cloud_providers
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY cloud_providers_update_admin
ON cloud_providers
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY cloud_providers_delete_admin
ON cloud_providers
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can view source connections" ON source_connections;
DROP POLICY IF EXISTS "Admins manage source insert" ON source_connections;
DROP POLICY IF EXISTS "Admins manage source update" ON source_connections;
DROP POLICY IF EXISTS "Admins manage source delete" ON source_connections;
DROP POLICY IF EXISTS source_connections_select_admin ON source_connections;
DROP POLICY IF EXISTS source_connections_insert_admin ON source_connections;
DROP POLICY IF EXISTS source_connections_update_admin ON source_connections;
DROP POLICY IF EXISTS source_connections_delete_admin ON source_connections;

CREATE POLICY source_connections_select_admin
ON source_connections
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY source_connections_insert_admin
ON source_connections
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY source_connections_update_admin
ON source_connections
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY source_connections_delete_admin
ON source_connections
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS profiles_select_owner_or_tenant_member ON profiles;
DROP POLICY IF EXISTS profiles_insert_owner ON profiles;
DROP POLICY IF EXISTS profiles_update_owner ON profiles;

CREATE POLICY profiles_select_owner_or_tenant_member
ON profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = profiles.id::text
      AND u.organization_id IS NOT NULL
      AND public.is_org_member(u.organization_id)
  )
);

CREATE POLICY profiles_insert_owner
ON profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_owner
ON profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());
