-- Two-factor authentication: encrypted TOTP secret and one-time recovery codes.
--
-- 2FA was never checked at sign-in; enforcing it makes a lost authenticator a
-- lockout, so enabling it now also issues recovery codes. Only their SHA-256
-- hashes are stored (each code is ~50 random bits, so no salt is needed), and a
-- code is removed from the array when it is used.
--
-- The secret moves to an encrypted column like every other stored credential
-- (encryptJson, ENV_ENCRYPTION_KEY). two_factor_secret stays as a read fallback
-- for secrets written before this migration; new writes clear it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret_encrypted TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_recovery_codes JSONB NOT NULL DEFAULT '[]'::jsonb;
