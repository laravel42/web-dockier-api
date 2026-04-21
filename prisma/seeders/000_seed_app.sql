-- Default application
INSERT INTO apps (id, name, slug)
VALUES ('app-default', 'Dockier', 'dockier')
ON CONFLICT (id) DO NOTHING;
