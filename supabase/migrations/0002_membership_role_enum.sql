DO $$
BEGIN
  CREATE TYPE membership_role AS ENUM ('admin', 'member');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
