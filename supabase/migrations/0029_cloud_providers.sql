CREATE TABLE IF NOT EXISTS cloud_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  region TEXT,
  connected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cloud_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view cloud providers" ON cloud_providers;
CREATE POLICY "Authenticated can view cloud providers"
ON cloud_providers FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins manage cloud providers insert" ON cloud_providers;
CREATE POLICY "Admins manage cloud providers insert"
ON cloud_providers FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage cloud providers update" ON cloud_providers;
CREATE POLICY "Admins manage cloud providers update"
ON cloud_providers FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage cloud providers delete" ON cloud_providers;
CREATE POLICY "Admins manage cloud providers delete"
ON cloud_providers FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE TRIGGER trg_cloud_providers_updated
BEFORE UPDATE ON cloud_providers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
