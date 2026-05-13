CREATE TABLE IF NOT EXISTS source_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  account TEXT,
  connected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE source_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view source connections" ON source_connections;
CREATE POLICY "Authenticated can view source connections"
ON source_connections FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins manage source insert" ON source_connections;
CREATE POLICY "Admins manage source insert"
ON source_connections FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage source update" ON source_connections;
CREATE POLICY "Admins manage source update"
ON source_connections FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage source delete" ON source_connections;
CREATE POLICY "Admins manage source delete"
ON source_connections FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE TRIGGER trg_source_connections_updated
BEFORE UPDATE ON source_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
