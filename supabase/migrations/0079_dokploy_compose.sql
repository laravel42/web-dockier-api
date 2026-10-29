-- Map each Dockier project to a Dokploy Compose resource.
--
-- A compose deploy is a different Dokploy RESOURCE KIND, not a different build
-- type. Dokploy's `compose` table has no build type and there is no
-- `compose.saveBuildType`: each service in the file builds from its own
-- `build:` or runs its own `image:`. So a compose project is tracked here,
-- parallel to dokploy_applications, rather than being squeezed into it.
--
-- A separate table rather than a `resource_kind` discriminator on
-- dokploy_applications: that column is named `dokploy_application_id`, and the
-- ten consumers that read it (teardown, the domains and network appliers,
-- command exec, the cancel route, ...) would each be reading an "application
-- id" that is not one. This leaves the working application path untouched, so
-- the blast radius of compose support is additive only.
--
-- UNIQUE (project_id) is kept deliberately. A compose stack is ONE Dokploy
-- resource holding N containers, so the existing one-project-one-resource
-- invariant still holds. A project has either an application row or a compose
-- row, never both; that is enforced in code by getProjectResource(), which
-- checks compose first, because a cross-table constraint would need a trigger
-- for no practical gain.
CREATE TABLE IF NOT EXISTS dokploy_composes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dokploy_compose_id TEXT NOT NULL,
  dokploy_server_id TEXT,
  -- Dokploy-assigned appName. Compose container names derive from it
  -- (<app_name>-<service>-N), so locating a container for logs or command
  -- execution needs it, exactly as dokploy_applications.app_name does.
  app_name TEXT,
  -- Path to the compose file INSIDE the repo. Not assumed to be at the root:
  -- a repo can hold several (deploy/dokploy/, deploy/local/, ...) and the one
  -- to deploy is the user's choice.
  compose_path TEXT NOT NULL DEFAULT './docker-compose.yml',
  -- The service a domain routes to, and the container port it listens on.
  -- Dokploy attaches a domain to one NAMED service inside the stack
  -- (domains.serviceName), so without these a domain cannot be registered at
  -- all. Reconciled from projects.settings on every deploy and stored here so
  -- the custom-domains applier, which runs outside a deploy, does not have to
  -- re-derive them -- the same single-source-of-truth reason
  -- dokploy_applications.container_port exists (migration 0073).
  entry_service TEXT,
  entry_port INTEGER,
  -- Service names as DOKPLOY parsed them (compose.loadServices), which is the
  -- authoritative list: it comes from the file after Dokploy cloned the repo
  -- and applied its own interpolation. Stored for the project UI and for
  -- diagnosing a disagreement with our own parse.
  service_names TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id)
);
