-- Static-hosting custom domains: certificate provider refs, DNS validation
-- records, and a verification state for the multi-step CDN handshake.
--
-- 0050_domains_certificates.sql constrained ssl_certificates.type to the three
-- VPS/Dokploy certificate kinds via an UNNAMED column-level CHECK. Static
-- hosting adds two more, issued and owned by the cloud provider: ACM
-- (CloudFront) and Google-managed (GCP HTTPS load balancer). Forcing those into
-- 'lets_encrypt' would make any future renewal logic act on certificates it
-- does not own.
--
-- Number: 0074 is earmarked for deployments.deploy_provider by
-- .kiro/specs/static-deploy-targets/requirements.md (REQ-5.2) and is left free.
-- A gap is harmless; renumbering a file another branch may already have applied
-- is not.

-- ─── type CHECK: widen to the two platform-owned kinds ──────────────────────
--
-- Catalog-driven rather than by-name. An unnamed column CHECK gets a generated
-- name; a DROP ... IF EXISTS against a guessed name would silently no-op and
-- leave the old three-value constraint rejecting 'acm' — a migration that
-- reports success and leaves the feature broken at the first insert.
--
-- Scoped to constraints whose key is EXACTLY the type column, so a future
-- multi-column check involving type is not collaterally dropped.
DO $$
DECLARE
  c record;
  type_attnum smallint;
BEGIN
  SELECT attnum INTO type_attnum
    FROM pg_attribute
   WHERE attrelid = 'ssl_certificates'::regclass
     AND attname = 'type'
     AND NOT attisdropped;

  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'ssl_certificates'::regclass
       AND contype = 'c'
       AND conkey = ARRAY[type_attnum]
  LOOP
    EXECUTE format('ALTER TABLE ssl_certificates DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE ssl_certificates
  DROP CONSTRAINT IF EXISTS ssl_certificates_type_check;

ALTER TABLE ssl_certificates
  ADD CONSTRAINT ssl_certificates_type_check
  CHECK (type IN ('lets_encrypt', 'custom', 'clone', 'acm', 'gcp_managed'));

-- ─── New columns ────────────────────────────────────────────────────────────

-- Provider-side identifier: an ACM certificate ARN, or a GCP sslCertificates
-- self-link. Needed both to attach the certificate and to poll its status.
ALTER TABLE ssl_certificates
  ADD COLUMN IF NOT EXISTS provider_ref TEXT;

-- The DNS record the user must publish, as the provider reports it.
-- ACM: { "name": "_x.example.com.", "type": "CNAME", "value": "_y.acm-validations.aws." }
-- GCP: null — a Google-managed certificate validates against the A record that
-- already has to exist, so there is no extra record to publish.
ALTER TABLE ssl_certificates
  ADD COLUMN IF NOT EXISTS validation_record JSONB;

-- Where this certificate is in the handshake. Distinct from `status`, which
-- answers "is there a usable certificate"; this answers "what is the user
-- waiting for, and is it their turn to act".
ALTER TABLE ssl_certificates
  ADD COLUMN IF NOT EXISTS verification_state TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE ssl_certificates
  DROP CONSTRAINT IF EXISTS ssl_certificates_verification_state_check;

ALTER TABLE ssl_certificates
  ADD CONSTRAINT ssl_certificates_verification_state_check
  CHECK (verification_state IN (
    'pending',          -- nothing requested yet
    'awaiting_dns',     -- user must publish a record (or the A record is not live)
    'provisioning',     -- provider is issuing / validating
    'attaching',        -- cert issued; CDN frontend update in flight
    'live',             -- serving on the custom domain over TLS
    'failed',
    'timed_out'
  ));

-- Human-readable detail for the current state, shown in the UI.
ALTER TABLE ssl_certificates
  ADD COLUMN IF NOT EXISTS verification_message TEXT;

-- Tracks when the CDN frontend update was started, so the poll worker can
-- observe a long-running CloudFront distribution update on a LATER invocation
-- instead of blocking a job for 5-20 minutes.
ALTER TABLE ssl_certificates
  ADD COLUMN IF NOT EXISTS attach_started_at TIMESTAMPTZ;

-- ─── Indexes ────────────────────────────────────────────────────────────────

-- One platform-owned certificate row per (project, domain). PARTIAL, scoped to
-- the two platform-owned types, so pre-existing duplicate VPS rows cannot fail
-- this migration.
--
-- NOTE for the certificate helpers: because this index is partial it is NOT
-- usable as a PostgREST .upsert() conflict target — ON CONFLICT inference needs
-- the statement to carry a predicate implying the index's, which PostgREST
-- cannot emit, and the attempt fails with 42P10. Use select -> insert and catch
-- 23505 instead; this index is the integrity guard, not the upsert target.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ssl_certificates_static_unique
  ON ssl_certificates (project_id, domain_name)
  WHERE type IN ('acm', 'gcp_managed');

-- Drives the cert-poll worker's recovery sweep. Partial so it stays tiny.
-- CONCURRENTLY is skipped deliberately: these migrations run in a transaction
-- (CONCURRENTLY cannot), ssl_certificates is small, and 0050 set the precedent
-- with a plain CREATE INDEX IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS idx_ssl_certificates_pending_verification
  ON ssl_certificates (verification_state)
  WHERE verification_state NOT IN ('live', 'failed');
