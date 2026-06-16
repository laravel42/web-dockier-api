-- One channel per type per organization (e.g. single default in-app channel).
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_channels_org_type
  ON notification_channels(organization_id, type);

-- Backfill default in-app channel for existing organizations.
INSERT INTO notification_channels (id, organization_id, type, config, enabled, created_at)
SELECT
  gen_random_uuid()::text,
  o.id::text,
  'in_app',
  '{}',
  true,
  NOW()
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM notification_channels nc
  WHERE nc.organization_id = o.id::text
    AND nc.type = 'in_app'
);
