-- Add a settings JSONB column to projects for extensible metadata:
-- color, avatar, framework version, notes, etc.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
