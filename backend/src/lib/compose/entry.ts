/**
 * Choosing the public service of a compose stack, and the port to route to it.
 *
 * Dokploy attaches a domain to ONE named service inside the stack
 * (`domains.serviceName`), so a compose deploy has to answer two questions the
 * compose file does not state outright: which service is the entrypoint, and
 * which container port it listens on. A wrong answer is a silent Bad Gateway,
 * so both resolvers return `undefined` rather than guess when the evidence runs
 * out — the wizard then asks.
 *
 * Both functions are pure. Tier 4 of the port chain needs the service's build
 * Dockerfile, which is network I/O, so the caller fetches it and passes the
 * `EXPOSE` value in.
 */

import { DOKPLOY_NETWORK, runnableServices, type ComposeService, type ParsedCompose } from "./parse.js";

/** Service names that conventionally front a stack, lowest-priority fallback. */
const FRONTEND_NAMES = ["web", "app", "frontend", "nginx", "caddy", "server", "www"];

/**
 * Pick the service a domain should route to.
 *
 * Order, first non-empty tier wins:
 *
 *  1. On `dokploy-network` AND declaring no Traefik router of its own. A
 *     service that already writes its own router rule is routed by that rule —
 *     it is reachable by design and is not the stack's front door. (A real
 *     example: an API that routes pattern-based preview hostnames itself, next
 *     to a `web` service whose domain is meant to be added in Dokploy.)
 *  2. On `dokploy-network` at all — Traefik can only reach these.
 *  3. Publishes a container port.
 *  4. Named like a frontend.
 *
 * Build-only pseudo-services are never candidates. Returns `undefined` when no
 * tier yields exactly one obvious answer, which means "ask the user".
 */
export function pickEntryService(parsed: ParsedCompose): ComposeService | undefined {
  // Only services a plain `docker compose up` starts: a profiled service never
  // runs under Dokploy, so routing a domain to it points Traefik at a
  // container that will not exist.
  const candidates = runnableServices(parsed);
  if (candidates.length === 0) return undefined;

  const onDokployNetwork = candidates.filter((s) => s.networks.includes(DOKPLOY_NETWORK));

  const tiers: ComposeService[][] = [
    onDokployNetwork.filter((s) => !s.hasTraefikRouter),
    onDokployNetwork,
    candidates.filter((s) => s.ports.length > 0),
    candidates.filter((s) => FRONTEND_NAMES.includes(s.name.toLowerCase())),
  ];

  for (const tier of tiers) {
    if (tier.length === 1) return tier[0];
    // Several candidates in the same tier: prefer a conventional frontend name
    // before giving up, so a two-service tier doesn't fall through to a worse
    // signal.
    if (tier.length > 1) {
      const named = tier.filter((s) => FRONTEND_NAMES.includes(s.name.toLowerCase()));
      if (named.length === 1) return named[0];
    }
  }

  // A single runnable service is unambiguous whatever else is true of it.
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * The container port Traefik should forward to for `service`.
 *
 * Order, first hit wins:
 *
 *  1. `ports:` — the container side.
 *  2. `expose:`.
 *  3. The service's own `traefik.…loadbalancer.server.port` label.
 *  4. `EXPOSE` in the service's build Dockerfile, passed in by the caller.
 *
 * Returns `undefined` when none of them states a port. Many compose files
 * publish nothing and rely on Traefik labels or the image's own EXPOSE, so this
 * is a normal outcome, not an error — it just means the user has to confirm.
 */
export function resolveEntryPort(
  service: ComposeService,
  dockerfileExpose?: number,
): number | undefined {
  return service.ports[0] ?? service.exposed[0] ?? service.traefikPort ?? dockerfileExpose;
}

/** Whether the chosen service can actually be reached by Dokploy's Traefik. */
export function isRoutable(service: ComposeService): boolean {
  return service.networks.includes(DOKPLOY_NETWORK);
}
