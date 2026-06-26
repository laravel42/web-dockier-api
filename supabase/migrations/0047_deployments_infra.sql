-- Add a JSONB column to store infrastructure metadata at deploy time.
-- This stores provider-specific details needed for post-deploy operations
-- (command execution, scaling, etc.) without guessing from URLs.
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS infra JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN deployments.infra IS 'Infrastructure metadata stored at deploy time. Shape varies by provider/strategy. Common fields: region, adapter, containerName, instanceId, stackName, serverIp, clusterName, serviceName, gcpProjectId.';
