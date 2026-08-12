-- Per-engine outcome for a scan, so a broken engine cannot read as a clean repo.
--
-- The SAST pipeline fans a scan out to four engines (semgrep, regex, sonarqube,
-- codeql) and aggregates their results. A crashed engine, a missing binary and a
-- genuinely clean repository all produced the same thing: an empty findings
-- list. For a security product that is the worst failure mode available —
-- silent under-reporting presented as a pass.
--
-- `engine_status` records {engine: {status, error}} for every engine that
-- reported. Scans where any engine failed are stored with status 'partial'
-- rather than 'success'.
--
-- Re-runnable: ADD COLUMN IF NOT EXISTS.

ALTER TABLE scans ADD COLUMN IF NOT EXISTS engine_status JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN scans.engine_status IS
    'Per-engine outcome: {"semgrep": {"status": "ok", "error": null}, ...}. '
    'Any engine with status != ok means the scan is incomplete; scans.status is then ''partial''.';
