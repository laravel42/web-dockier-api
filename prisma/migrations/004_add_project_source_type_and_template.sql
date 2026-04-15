-- Add source_type and template columns to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'repository';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS template TEXT NOT NULL DEFAULT '';
