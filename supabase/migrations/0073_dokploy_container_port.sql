-- Persist the resolved container port for a Dokploy application.
--
-- Traefik must forward a domain to the port the container actually listens on.
-- That port depends on BOTH the builder and the app's runtime:
--   railpack + Node (Express, SSR Astro, ...) → 3000 (the injected PORT)
--   railpack + PHP/static (FrankenPHP/Caddy)  → 80
--   nixpacks + PHP (nginx)                    → 80
--   dockerfile / everything else              → 3000
--
-- The deploy pipeline computes this correctly in configure-app, where the
-- language and tech stack are known. The custom-domains applier, however, runs
-- independently of a deploy and had to RE-DERIVE the port from the cached
-- `build_type` alone — which cannot distinguish railpack-Node (3000) from
-- railpack-PHP (80), and knew nothing about the nixpacks-PHP fallback. The two
-- derivations drifted, so custom domains could be registered on a port nothing
-- listens on: Let's Encrypt succeeds, the UI shows a healthy certificate, and
-- the domain serves Bad Gateway.
--
-- Storing the resolved port makes it a single source of truth: computed once at
-- deploy time, read by every consumer. Nullable so existing rows (and any
-- non-Dokploy path) fall back to the previous derivation until their next deploy.

ALTER TABLE dokploy_applications
  ADD COLUMN IF NOT EXISTS container_port INTEGER;
