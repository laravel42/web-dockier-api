-- One-shot cache invalidation for the Nuxt/Next static-capability fix.
--
-- `analysis_cache` rows carry no schema version, the read path in
-- git-integration/routes/analysis.ts has no TTL, and the route's backfill only
-- fills keys that are ABSENT. So BOTH halves of the fix need the stale rows
-- gone:
--   * staticCapable: false — a Nuxt repo with a `nuxt generate` script that is
--     in fact static-capable keeps showing the old "needs a server" verdict;
--   * staticCapable: true  — an SSR Next repo wrongly marked static by the old
--     `includes("output:") && includes("export")` probe keeps being offered the
--     Static card.
-- Deleting the whole row (rather than stripping the one key) is deliberate: a
-- row without `staticCapable` is served as-is and the frontend's fallback then
-- guesses, so only a full re-analyze produces a correct verdict. The unrelated
-- cached data that goes with it (tech stack, favicon) is a cache and
-- regenerates on the next analyze. `stack_cache` / `stats_cache` carry no
-- static verdict and are untouched.

DELETE FROM analysis_cache WHERE result->>'staticCapable' IN ('true', 'false');
