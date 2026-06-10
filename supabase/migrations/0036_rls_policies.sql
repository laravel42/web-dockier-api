-- Row Level Security Policies
-- Defense-in-depth layer. The backend uses service_role (bypasses RLS),
-- but these protect against direct client access via anon/authenticated keys.
--
-- Pattern: users can only access rows belonging to organizations they are members of.

-- Helper function: check if a user is a member of an organization (UUID)
CREATE OR REPLACE FUNCTION public.is_member_of(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

-- Helper function: check if a user is a member of an org (TEXT org_id variant)
CREATE OR REPLACE FUNCTION public.is_member_of_text(org_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE organization_id::text = org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

-- ============================================================
-- PROFILES
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by owner" ON profiles;
CREATE POLICY "Profiles are viewable by owner"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their organizations" ON organizations;
CREATE POLICY "Members can view their organizations"
  ON organizations FOR SELECT
  TO authenticated
  USING (is_member_of(id));

-- ============================================================
-- ORGANIZATION_MEMBERSHIPS
-- ============================================================
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view memberships in their org" ON organization_memberships;
CREATE POLICY "Members can view memberships in their org"
  ON organization_memberships FOR SELECT
  TO authenticated
  USING (is_member_of(organization_id));

-- ============================================================
-- USERS
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view themselves" ON users;
CREATE POLICY "Users can view themselves"
  ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid()::text);

DROP POLICY IF EXISTS "Users can view org members" ON users;
CREATE POLICY "Users can view org members"
  ON users FOR SELECT
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND is_member_of(organization_id)
  );

DROP POLICY IF EXISTS "Users can update themselves" ON users;
CREATE POLICY "Users can update themselves"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid()::text)
  WITH CHECK (id = auth.uid()::text);

-- ============================================================
-- ROLES
-- ============================================================
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view roles in their org" ON roles;
CREATE POLICY "Members can view roles in their org"
  ON roles FOR SELECT
  TO authenticated
  USING (is_member_of_text(organization_id));

-- ============================================================
-- PERMISSIONS
-- ============================================================
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view permissions" ON permissions;
CREATE POLICY "Anyone authenticated can view permissions"
  ON permissions FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- ROLE_PERMISSIONS
-- ============================================================
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view role_permissions for their org roles" ON role_permissions;
CREATE POLICY "Members can view role_permissions for their org roles"
  ON role_permissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM roles
      WHERE roles.id = role_permissions.role_id
        AND is_member_of_text(roles.organization_id)
    )
  );

-- ============================================================
-- PROJECTS
-- ============================================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view projects in their org" ON projects;
CREATE POLICY "Members can view projects in their org"
  ON projects FOR SELECT
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND is_member_of(organization_id::uuid)
  );

-- ============================================================
-- GIT_CONNECTIONS
-- ============================================================
ALTER TABLE git_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view git connections in their org" ON git_connections;
CREATE POLICY "Members can view git connections in their org"
  ON git_connections FOR SELECT
  TO authenticated
  USING (is_member_of_text(organization_id));

-- ============================================================
-- SCANS
-- ============================================================
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view scans in their org" ON scans;
CREATE POLICY "Members can view scans in their org"
  ON scans FOR SELECT
  TO authenticated
  USING (is_member_of_text(organization_id));

-- ============================================================
-- FINDINGS
-- ============================================================
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view findings in their org" ON findings;
CREATE POLICY "Members can view findings in their org"
  ON findings FOR SELECT
  TO authenticated
  USING (is_member_of_text(organization_id));

-- ============================================================
-- CUSTOM_RULES
-- ============================================================
ALTER TABLE custom_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view custom rules in their org" ON custom_rules;
CREATE POLICY "Members can view custom rules in their org"
  ON custom_rules FOR SELECT
  TO authenticated
  USING (is_member_of_text(organization_id));

-- ============================================================
-- OPENGREP_RULES
-- ============================================================
ALTER TABLE opengrep_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view opengrep rules in their org" ON opengrep_rules;
CREATE POLICY "Members can view opengrep rules in their org"
  ON opengrep_rules FOR SELECT
  TO authenticated
  USING (is_member_of_text(organization_id));

-- ============================================================
-- SONARQUBE_RULES
-- ============================================================
ALTER TABLE sonarqube_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view sonarqube rules in their org" ON sonarqube_rules;
CREATE POLICY "Members can view sonarqube rules in their org"
  ON sonarqube_rules FOR SELECT
  TO authenticated
  USING (is_member_of_text(organization_id));

-- ============================================================
-- NOTIFICATION_CHANNELS
-- ============================================================
ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view notification channels in their org" ON notification_channels;
CREATE POLICY "Members can view notification channels in their org"
  ON notification_channels FOR SELECT
  TO authenticated
  USING (is_member_of_text(organization_id));

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view notifications in their org" ON notifications;
CREATE POLICY "Members can view notifications in their org"
  ON notifications FOR SELECT
  TO authenticated
  USING (is_member_of_text(organization_id));

-- ============================================================
-- SERVER_PROVIDERS
-- ============================================================
ALTER TABLE server_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view server providers in their org" ON server_providers;
CREATE POLICY "Members can view server providers in their org"
  ON server_providers FOR SELECT
  TO authenticated
  USING (is_member_of_text(organization_id));

-- ============================================================
-- DEPLOYMENTS
-- ============================================================
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view deployments in their org" ON deployments;
CREATE POLICY "Members can view deployments in their org"
  ON deployments FOR SELECT
  TO authenticated
  USING (is_member_of_text(organization_id));

-- ============================================================
-- SSH_KEYS
-- ============================================================
ALTER TABLE ssh_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view SSH keys in their org" ON ssh_keys;
CREATE POLICY "Members can view SSH keys in their org"
  ON ssh_keys FOR SELECT
  TO authenticated
  USING (is_member_of_text(organization_id));

-- ============================================================
-- BUILDS
-- ============================================================
ALTER TABLE builds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view builds in their org" ON builds;
CREATE POLICY "Members can view builds in their org"
  ON builds FOR SELECT
  TO authenticated
  USING (is_member_of_text(organization_id));

-- ============================================================
-- CACHE TABLES (org-scoped read)
-- ============================================================
ALTER TABLE analysis_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view analysis cache in their org" ON analysis_cache;
CREATE POLICY "Members can view analysis cache in their org"
  ON analysis_cache FOR SELECT TO authenticated
  USING (is_member_of_text(organization_id));

ALTER TABLE stack_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view stack cache in their org" ON stack_cache;
CREATE POLICY "Members can view stack cache in their org"
  ON stack_cache FOR SELECT TO authenticated
  USING (is_member_of_text(organization_id));

ALTER TABLE stats_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view stats cache in their org" ON stats_cache;
CREATE POLICY "Members can view stats cache in their org"
  ON stats_cache FOR SELECT TO authenticated
  USING (is_member_of_text(organization_id));

ALTER TABLE repo_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view repo cache in their org" ON repo_cache;
CREATE POLICY "Members can view repo cache in their org"
  ON repo_cache FOR SELECT TO authenticated
  USING (is_member_of_text(organization_id));

ALTER TABLE sensitive_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view sensitive cache via project" ON sensitive_cache;
CREATE POLICY "Members can view sensitive cache via project"
  ON sensitive_cache FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = sensitive_cache.project_id
        AND projects.organization_id IS NOT NULL
        AND is_member_of(projects.organization_id::uuid)
    )
  );
