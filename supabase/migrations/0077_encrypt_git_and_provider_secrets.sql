-- Store the two highest-value secrets encrypted at rest.
--
-- Background: git_connections.personal_token (a Git PAT with push access) and
-- server_providers.credentials (AWS access keys / the full GCP service-account
-- JSON) were the only remaining secrets kept in plaintext, while SSH keys, PM
-- integration credentials and network passwords already go through
-- encryptJson/decryptJson (AES-256-GCM, key ENV_ENCRYPTION_KEY). These two
-- columns hold an encryptJson payload, which only the server can decrypt. They
-- are NEVER returned by the API — see deploy/domain/mappers.ts rowToProvider
-- and the field-by-field responses in git-integration/domain/connections.ts.
--
-- Nullable: rows created before this column have no encrypted copy, and the
-- read sites fall back to the plaintext column until
-- `pnpm --filter @dockier/backend-fastify backfill:encrypt-secrets` runs.
-- Postgres cannot do that backfill itself: the AES key lives in the Node
-- process, not in the database.
--
-- The plaintext columns (personal_token, credentials) are deliberately KEPT
-- here. They are dropped in a later migration, once every row has been
-- backfilled and the operator confirms it — dropping them now would be an
-- irreversible credential loss for any row the backfill has not reached.
--
-- No index: these columns are never filtered or ordered on.

ALTER TABLE git_connections
  ADD COLUMN IF NOT EXISTS personal_token_encrypted TEXT;

ALTER TABLE server_providers
  ADD COLUMN IF NOT EXISTS credentials_encrypted TEXT;
