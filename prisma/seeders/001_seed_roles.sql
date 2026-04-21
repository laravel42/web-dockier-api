-- Default roles: Admin (full access) and Viewer (read-only)
INSERT INTO roles (id, app_id, name, description, permissions)
VALUES
  ('role-admin', '', 'Admin', 'Full access to all features', ARRAY[
    'project:view','project:create','project:edit','project:delete',
    'deploy:view','deploy:create','deploy:delete',
    'scan:view','scan:create','scan:delete',
    'settings:view','settings:edit',
    'user:view','user:create','user:edit','user:delete'
  ]),
  ('role-viewer', '', 'Viewer', 'Read-only access', ARRAY[
    'project:view',
    'deploy:view',
    'scan:view',
    'settings:view',
    'user:view'
  ])
ON CONFLICT (id) DO NOTHING;
