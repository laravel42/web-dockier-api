-- TOTP replay protection: the time step (30 s counter) of the last accepted
-- authenticator code. A code is valid for about 90 seconds (one step either side),
-- so without this the same 6 digits could be used again by someone who saw them.
-- A code is accepted only for a step after this one, set with a conditional
-- UPDATE so two concurrent sign-ins cannot both spend the same code.
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_last_counter BIGINT;
