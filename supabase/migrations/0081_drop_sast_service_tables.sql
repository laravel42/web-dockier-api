-- Drop what only the removed Python SAST service used.
--
-- quality_gates (0065) and scans.quality_gate_status were evaluated and written
-- by that service's aggregator; engine_settings (0066) held its per-tenant
-- engine configuration. The Fastify scan pipeline never read or wrote any of
-- them. Recreating them later is a copy of 0065 / 0066.
--
-- Guarded rather than unconditional: this drops tables, so it refuses to run on
-- a database where they hold anything beyond what 0065 seeded. On the database
-- this was written against, engine_settings had 0 rows, quality_gates only the
-- 'system-dockier-way' seed, and quality_gate_status was NULL on every scan.
-- If the guard fires, look at the data before deciding anything.

DO $$
BEGIN
  IF to_regclass('public.engine_settings') IS NOT NULL
     AND EXISTS (SELECT 1 FROM engine_settings) THEN
    RAISE EXCEPTION 'engine_settings has rows; refusing to drop it';
  END IF;

  IF to_regclass('public.quality_gates') IS NOT NULL
     AND EXISTS (SELECT 1 FROM quality_gates WHERE id <> 'system-dockier-way') THEN
    RAISE EXCEPTION 'quality_gates has rows besides the 0065 seed; refusing to drop it';
  END IF;

  IF EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'scans' AND column_name = 'quality_gate_status'
     ) AND EXISTS (SELECT 1 FROM scans WHERE quality_gate_status IS NOT NULL) THEN
    RAISE EXCEPTION 'scans.quality_gate_status has values; refusing to drop it';
  END IF;
END
$$;

DROP TABLE IF EXISTS engine_settings;
DROP TABLE IF EXISTS quality_gates;
ALTER TABLE scans DROP COLUMN IF EXISTS quality_gate_status;
