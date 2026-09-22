-- Dokploy command execution support.
--
-- Enables running commands (automatic post-deploy scripts AND on-demand
-- commands from the Dockier UI) inside a deployed app's container over SSH.
--
-- Two additions:
--   1. dokploy_servers.ssh_private_key_encrypted — a Dockier-OWNED SSH private
--      key for the server. Dokploy manages its own key for its own SSH access;
--      Dockier installs a second public key on the VM at provision time and
--      keeps the matching private key here (encrypted at rest) so it can SSH in
--      to run `docker exec` against the app container. Encrypted via the
--      shared AES-256-GCM helper (shared/auth/crypto.ts, encryptJson format).
--   2. dokploy_applications.app_name — the Dokploy-assigned application
--      `appName` (the Docker Swarm service name). Needed to locate the running
--      container on the box (`docker ps --filter name=<app_name>`). Dokploy only
--      returns this from its API at create time, so we persist it for later use.

ALTER TABLE dokploy_servers
  ADD COLUMN IF NOT EXISTS ssh_private_key_encrypted TEXT;

ALTER TABLE dokploy_applications
  ADD COLUMN IF NOT EXISTS app_name TEXT;
