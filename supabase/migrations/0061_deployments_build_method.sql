-- Persist the build method chosen for each deployment (dockerfile / railpack /
-- nixpacks / codebuild). Previously this was passed through the pipeline but not
-- stored, so redeploy/rollback could not recover it and fell back to a local
-- Docker build — which fails on hosts without a Docker daemon (e.g. Railway).
ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS build_method TEXT;
