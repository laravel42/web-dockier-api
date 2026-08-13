-- Per-tenant configuration for the SAST engines.
--
-- The SAST worker prototype carried a `tool_configurations` table in its own
-- init_db.sql that nothing ever read, and the engines hardcoded their settings.
-- This brings engine configuration into the canonical schema, per tenant, so a
-- SonarQube host or a CodeQL language set is a stored decision rather than a
-- deploy-time environment variable.
--
-- One row per (organization, engine). `config` is a JSONB document whose shape
-- is owned by the engine and validated at the API boundary — a column per
-- setting would mean a migration every time an engine gains a knob.
--
-- Secrets are NOT stored here. A SonarQube token stays in the environment /
-- Cloudflare Secrets Store; this table records which host to talk to and how,
-- never how to authenticate. See the CHECK below, which enforces that.
--
-- Re-runnable: IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS engine_settings (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT '',
    engine TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, engine)
);

CREATE INDEX IF NOT EXISTS idx_engine_settings_org ON engine_settings(organization_id);

-- A settings row must never become a place credentials accumulate. Anything
-- that looks like a secret belongs in the secret store, and storing one here
-- would put it in every backup and every SELECT the API makes.
ALTER TABLE engine_settings DROP CONSTRAINT IF EXISTS engine_settings_no_secrets;
ALTER TABLE engine_settings ADD CONSTRAINT engine_settings_no_secrets CHECK (
    NOT (config ?| ARRAY['token', 'secret', 'password', 'apiKey', 'api_key', 'privateKey'])
);

COMMENT ON TABLE engine_settings IS
    'Per-tenant SAST engine configuration. Never stores credentials — see the '
    'engine_settings_no_secrets constraint; secrets live in the secret store.';
COMMENT ON COLUMN engine_settings.config IS
    'Engine-owned JSONB document, validated at the API boundary.';
