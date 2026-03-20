ALTER TABLE deployments ADD COLUMN commit_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE deployments ADD COLUMN docker_image TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_deployments_repo_commit ON deployments(repo, branch, commit_hash);
