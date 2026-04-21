ALTER TABLE analysis_cache ADD COLUMN IF NOT EXISTS project_id TEXT DEFAULT '';
ALTER TABLE stack_cache ADD COLUMN IF NOT EXISTS project_id TEXT DEFAULT '';
ALTER TABLE stats_cache ADD COLUMN IF NOT EXISTS project_id TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_analysis_cache_project ON analysis_cache(project_id);
CREATE INDEX IF NOT EXISTS idx_stack_cache_project ON stack_cache(project_id);
CREATE INDEX IF NOT EXISTS idx_stats_cache_project ON stats_cache(project_id);
