-- Store an encrypted copy of each security-rule credential's password.
--
-- Background: security_rule_credentials.password_hash is a bcrypt hash, used by
-- the legacy nginx/htpasswd applier. The Dokploy applier, however, calls
-- Dokploy's `security.create` which requires the PLAINTEXT password (Dokploy
-- re-hashes it as APR1 for the Traefik BasicAuth middleware). A bcrypt hash
-- can't be reversed, so we keep an encrypted-at-rest copy of the plaintext
-- (same approach as the Dokploy SSH key: encryptJson/decryptJson) that only the
-- server can decrypt. It is NEVER returned by the API.
--
-- Nullable: existing rows (created before this column) have no encrypted copy;
-- the Dokploy applier skips credentials it can't decrypt and logs a warning
-- instructing the user to recreate the credential.

ALTER TABLE security_rule_credentials
  ADD COLUMN IF NOT EXISTS password_encrypted TEXT;
