-- One-shot cache invalidation for the Nuxt/Next static-capability fix.
--
-- `analysis_cache` rows carry no schema version, and the analysis route's
-- backfill only fills keys that are ABSENT — a row already holding
-- staticCapable: false would keep showing the old "needs a server" verdict for
-- a Nuxt/Next repo that is in fact static-capable. These rows are a cache and
-- regenerate on the next analyze, so deleting the affected ones is the whole
-- fix. `stack_cache` / `stats_cache` carry no static verdict and are untouched.

DELETE FROM analysis_cache WHERE result->>'staticCapable' = 'false';
