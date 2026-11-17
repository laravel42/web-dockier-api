-- At most one running scan per project.
--
-- runScan's lock (UPDATE ... WHERE status <> 'running') serialises runs of ONE scan
-- row, but every "Run new scan" creates a new row, so two scans of the same project
-- could run at once: two clones, two Semgrep runs at full CPU, two SonarQube
-- analyses of the same code. The database enforces it so no race can get past it;
-- runScan maps the violation (23505) to "a scan of this project is already running".
--
-- Only 'running': 'pending' is a scan that was created and not started yet.
--
-- CONCURRENTLY is skipped deliberately, as in 0075: these migrations run in a
-- transaction (CONCURRENTLY cannot), and the partial index covers few rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM scans WHERE status = 'running' GROUP BY project_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A project has more than one running scan; mark the extra ones failed before applying 0089.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scans_one_running_per_project
  ON scans (project_id)
  WHERE status = 'running';
