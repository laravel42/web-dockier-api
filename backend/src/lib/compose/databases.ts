/**
 * Databases declared INSIDE a compose stack.
 *
 * This decides whether Dockier provisions backing services for a compose
 * deploy. When the stack brings its own Postgres (with its own volume,
 * credentials and `DATABASE_URL` wiring), provisioning a second Dokploy
 * database and injecting `DB_HOST`/`DB_PASSWORD` over the user's values does
 * not merely duplicate work — it points a working application at the wrong
 * server. So the rule is: if the file declares a database, we provision none.
 *
 * A compose file that declares NO database (a Django or Laravel stack expecting
 * a managed one) keeps the existing service picker behaviour unchanged.
 */

import type { ComposeService, ParsedCompose } from "./parse.js";

/**
 * Image name → the engine Dockier would otherwise provision.
 *
 * Matched against the image's REPOSITORY part only, so a registry prefix and a
 * tag are both ignored ("docker.io/library/postgres:16-alpine" → postgres), and
 * an unrelated image whose tag happens to contain "redis" cannot match.
 */
const ENGINE_IMAGES: Array<{ pattern: RegExp; engine: string; serviceType: string }> = [
  { pattern: /^postgres(ql)?$/, engine: "postgres", serviceType: "database" },
  { pattern: /^(postgis|pgvector|timescale(db)?|supabase\/postgres)$/, engine: "postgres", serviceType: "database" },
  { pattern: /^mysql$/, engine: "mysql", serviceType: "database" },
  { pattern: /^(mariadb|percona)$/, engine: "mysql", serviceType: "database" },
  { pattern: /^(redis|valkey|redis-stack(-server)?)$/, engine: "redis", serviceType: "cache" },
  { pattern: /^(memcached)$/, engine: "memcached", serviceType: "cache" },
  { pattern: /^mongo(db)?$/, engine: "mongo", serviceType: "database" },
  { pattern: /^(rabbitmq)$/, engine: "rabbitmq", serviceType: "queue" },
];

export interface ComposeDatabase {
  /** The compose service name, i.e. the hostname other services reach it on. */
  service: string;
  /** Engine family, using the same vocabulary as the Dokploy database stage. */
  engine: string;
  /** "database" | "cache" | "queue" — matches the deploy service picker's types. */
  serviceType: string;
  image: string;
}

/** Databases and caches the compose file declares itself. */
export function detectComposeDatabases(parsed: ParsedCompose): ComposeDatabase[] {
  const found: ComposeDatabase[] = [];

  for (const service of parsed.services) {
    const match = engineFor(service);
    if (match) {
      found.push({ service: service.name, image: service.image ?? "", ...match });
    }
  }

  return found;
}

/**
 * Whether Dockier should skip provisioning backing services for this stack.
 *
 * True as soon as the file declares ANY database or cache: a stack that brings
 * its own Postgres but expects a managed Redis is rare, and injecting half a
 * connection set is worse than injecting none.
 */
export function declaresOwnDatabase(parsed: ParsedCompose): boolean {
  return detectComposeDatabases(parsed).length > 0;
}

function engineFor(service: ComposeService): { engine: string; serviceType: string } | undefined {
  if (!service.image) return undefined;
  const names = matchNames(imageRepository(service.image));
  for (const { pattern, engine, serviceType } of ENGINE_IMAGES) {
    if (names.some((name) => pattern.test(name))) return { engine, serviceType };
  }
  return undefined;
}

/**
 * The repository part of an image reference, lowercased, with the registry and
 * the tag/digest removed. "docker.io/library/postgres:16" → "postgres".
 *
 * A leading registry host is identified by a dot or a port in the first
 * segment, which is Docker's own rule; "library/" is Docker Hub's implicit
 * namespace and is dropped so official images match their bare name.
 */
function imageRepository(image: string): string {
  let ref = image.trim().toLowerCase();

  // Strip the digest first, then the tag — a digest contains a colon too.
  ref = ref.split("@")[0];
  const lastSlash = ref.lastIndexOf("/");
  const lastColon = ref.lastIndexOf(":");
  if (lastColon > lastSlash) ref = ref.slice(0, lastColon);

  const segments = ref.split("/");
  if (segments.length > 1 && /[.:]/.test(segments[0])) segments.shift();
  if (segments.length > 1 && segments[0] === "library") segments.shift();

  return segments.join("/");
}

/**
 * Candidate names to match a reference against: the full repository, and its
 * last segment.
 *
 * The last segment is needed because several engines publish under their own
 * namespace — `valkey/valkey`, `bitnami/redis` — and matching the full
 * repository alone misses them. It stays safe because the patterns are anchored:
 * `bitnami/postgresql-repmgr` reduces to `postgresql-repmgr`, which matches
 * neither `^postgres(ql)?$` nor anything else, and an application image like
 * `mycompany/api` reduces to `api`.
 */
function matchNames(repository: string): string[] {
  const last = repository.split("/").pop() ?? repository;
  return last === repository ? [repository] : [repository, last];
}
