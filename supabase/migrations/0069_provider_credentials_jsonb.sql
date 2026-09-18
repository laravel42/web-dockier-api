-- Replace the generic api_key / api_secret columns on server_providers with a
-- single per-provider `credentials` JSONB blob. The two-column model never fit
-- every provider: AWS uses both (access key id + secret access key), but GCP
-- only ever used api_key (the full service-account JSON key) and left api_secret
-- dead. A JSONB shape lets each provider store exactly the fields it needs.
--
-- Stored shape (discriminated on `kind`, mirrors the provider column):
--   AWS: { "kind": "aws", "accessKeyId": "...", "secretAccessKey": "..." }
--   GCP: { "kind": "gcp", "serviceAccountKey": "<service-account JSON string>" }

ALTER TABLE server_providers
    ADD COLUMN IF NOT EXISTS credentials JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill existing rows into the new shape. `provider` is the source of truth
-- for the credential kind. Anything that isn't recognizably AWS is treated as
-- GCP, since those were the only two providers ever stored and GCP smuggled its
-- service-account JSON through api_key.
UPDATE server_providers
SET credentials = CASE
    WHEN lower(provider) = 'aws' THEN
        jsonb_build_object(
            'kind', 'aws',
            'accessKeyId', COALESCE(api_key, ''),
            'secretAccessKey', COALESCE(api_secret, '')
        )
    ELSE
        jsonb_build_object(
            'kind', 'gcp',
            'serviceAccountKey', COALESCE(api_key, '')
        )
END
WHERE credentials = '{}'::jsonb;

-- Drop the superseded columns. api_key/api_secret are folded into credentials;
-- app_runner_connection_arn was only ever written as "" and never read.
ALTER TABLE server_providers DROP COLUMN IF EXISTS api_key;
ALTER TABLE server_providers DROP COLUMN IF EXISTS api_secret;
ALTER TABLE server_providers DROP COLUMN IF EXISTS app_runner_connection_arn;
