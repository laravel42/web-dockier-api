-- Default admin user (password: Admin123!)
-- bcrypt hash of "Admin123!"
INSERT INTO users (id, app_id, role_id, email, password_hash, name, language, timezone)
VALUES (
  'user-admin',
  '',
  'role-admin',
  'admin@dockier.io',
  '$2b$10$ROg2cPJ/0z8.viqmude7luJttckRJYonMnLTZT5cEnpQvZFXlyLJa',
  'Admin',
  'en',
  'UTC'
)
ON CONFLICT (id) DO NOTHING;
