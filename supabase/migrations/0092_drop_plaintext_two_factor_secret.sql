-- Drop users.two_factor_secret, the plaintext TOTP secret column.
--
-- Since 0090 the secret is written only to two_factor_secret_encrypted, and every
-- write clears this column. What can still be left in it:
--
--   * A secret from a 2FA setup that was started before 0090 and never enabled
--     (two_factor_enabled = false). It protects nothing: sign-in ignores it, and
--     starting setup again generates a new one. Cleared here.
--   * A secret of an account with 2FA ENABLED. Dropping it would lock that user
--     out, so the migration refuses instead.
--
-- Apply AFTER deploying the backend that no longer reads the column; the previous
-- backend selects it and would fail every 2FA operation once it is gone.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'two_factor_secret'
  ) THEN
    IF EXISTS (SELECT 1 FROM users WHERE two_factor_secret IS NOT NULL AND two_factor_enabled) THEN
      RAISE EXCEPTION 'An account with 2FA enabled still has a plaintext secret; re-save it encrypted before applying 0092.';
    END IF;
  END IF;
END $$;
ALTER TABLE users DROP COLUMN IF EXISTS two_factor_secret;
