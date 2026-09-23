/**
 * Stage: Provision Databases (self-hosted services)
 *
 * For each detected service with `mode: "vps"`, provisions the corresponding
 * Dokploy database service (mysql/postgres/redis) in the project's environment
 * and returns its connection details so the app's env can be wired to it.
 *
 * Managed-mode services are ignored here — the app reaches those via its own
 * env credentials.
 *
 * Idempotent + self-healing: a mapped database is reused only if it still
 * exists in Dokploy; a dangling mapping (service deleted out-of-band) is
 * cleared and re-provisioned. Provisioning is best-effort per service — a
 * failure is logged and surfaced, but engine detection and naming are
 * deterministic so retries converge.
 */

import type { DokployClient } from "../client.js";
import type { DeployService, DokployDatabase } from "../types.js";
import { getDatabase, upsertDatabase, deleteDatabaseMapping } from "../mappings.js";
import { getErrMsg } from "../../../../../shared/utils/error-message.js";

/** A provisioned self-hosted service's connection details, for env injection. */
export interface ProvisionedDatabase {
  /** Service category: "database" | "cache". */
  serviceType: string;
  /** Engine: "mysql" | "postgres" | "redis". */
  engine: string;
  /**
   * Internal hostname the app connects to (DB_HOST / REDIS_HOST). This is the
   * Swarm-resolvable `tasks.<appName>` form, not the bare service name — see
   * toSwarmResolvableHost for why.
   */
  host: string;
  port: number;
  database?: string;
  user?: string;
  password: string;
}

export interface ProvisionDatabasesResult {
  databases: ProvisionedDatabase[];
}

const DEFAULT_IMAGES: Record<string, string> = {
  mysql: "mysql:8",
  postgres: "postgres:16",
  redis: "redis:7",
};

const DEFAULT_PORTS: Record<string, number> = {
  mysql: 3306,
  postgres: 5432,
  redis: 6379,
};

/**
 * Convert a Dokploy service `appName` into the host the APP should actually use
 * to reach it: the Swarm-native `tasks.<appName>` form.
 *
 * Why not the bare `appName`: Dokploy deploys every database/app as a Docker
 * Swarm service in VIP (virtual-IP) mode. The bare service name resolves to a
 * virtual IP served by IPVS — but on some hosts (notably minimal/again-AWS
 * kernels, or when Swarm's advertise address is misconfigured) that VIP name
 * fails to resolve at all, producing exactly:
 *
 *   getaddrinfo for <appName> failed: Name or service not known
 *
 * which crashes Laravel's startup `migrate` and yields a Bad Gateway. Docker
 * Swarm always publishes a second DNS name, `tasks.<service>`, that resolves
 * directly to the running task container IPs and bypasses the VIP/IPVS layer
 * entirely. Dokploy documents this as the way to reach a deployed service by
 * name. It's correct whether or not VIP mode is healthy, so we always use it
 * for the app→DB connection.
 *
 * Idempotent: an already-prefixed or empty host is returned unchanged, so
 * reused mappings (whose stored host may already be normalized) never become
 * `tasks.tasks.<name>`.
 */
export function toSwarmResolvableHost(appName: string): string {
  const host = appName.trim();
  if (!host) return host;
  if (host.startsWith("tasks.")) return host;
  return `tasks.${host}`;
}

/**
 * Provision all vps-mode services for the project.
 */
export async function stageProvisionDatabases(params: {
  projectId: string;
  projectName: string;
  environmentId: string;
  serverId: string;
  services: DeployService[];
  /** Project env vars — used to detect the SQL engine (DB_CONNECTION). */
  envVars: Array<{ name: string; value: string }>;
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<ProvisionDatabasesResult> {
  const { projectId, projectName, environmentId, serverId, services, envVars, client, log } = params;

  const vps = services.filter((s) => s.mode === "vps");
  if (vps.length === 0) return { databases: [] };

  // Collapse services to at most ONE instance per engine. Laravel maps queue,
  // cache, broadcasting, and session all onto a single Redis; and there's one
  // SQL database. Provisioning a separate container per service category would
  // waste resources and leave the app pointing at only the last one. So we key
  // provisioning on the ENGINE, using a stable service_type per engine
  // ("database" for SQL, "cache" for redis) for the mapping row.
  const byEngine = new Map<string, string>(); // engine → canonical service_type
  for (const svc of vps) {
    const engine = engineForService(svc, envVars);
    if (!engine) {
      await log(`[stage:provision-databases] Skipping unsupported service "${svc.type}".`);
      continue;
    }
    if (!byEngine.has(engine)) {
      byEngine.set(engine, engine === "redis" ? "cache" : "database");
    }
  }

  const databases: ProvisionedDatabase[] = [];
  for (const [engine, serviceType] of byEngine) {
    try {
      const provisioned = await ensureDatabase({
        projectId,
        projectName,
        environmentId,
        serverId,
        serviceType,
        engine,
        envVars,
        client,
        log,
      });
      databases.push(provisioned);
    } catch (err) {
      // Non-fatal: log and continue. The app can still deploy; the missing DB
      // will surface as a runtime connection error the user can act on.
      await log(`[stage:provision-databases] ✗ Failed to provision ${engine}: ${getErrMsg(err)}`);
    }
  }

  return { databases };
}

/**
 * Provision (or reuse) a single database service and return its connection
 * details. A mapped service is reused only if it STILL EXISTS in Dokploy: a
 * service deleted out-of-band (e.g. removed in the Dokploy UI) leaves a
 * dangling mapping row whose hostname no longer resolves, which wires the app
 * to a dead DB_HOST and crashes it at startup ("getaddrinfo ... Name or service
 * not known" → Bad Gateway). When the service is gone we clear the stale
 * mapping and recreate it — mirroring the applicationExists() self-healing in
 * configure-app.
 */
async function ensureDatabase(params: {
  projectId: string;
  projectName: string;
  environmentId: string;
  serverId: string;
  serviceType: string;
  engine: string;
  envVars: Array<{ name: string; value: string }>;
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<ProvisionedDatabase> {
  const { projectId, projectName, environmentId, serverId, serviceType, engine, envVars, client, log } = params;

  const existing = await getDatabase(projectId, serviceType);
  if (existing) {
    // Only reuse if the service still exists in Dokploy. A dangling mapping
    // (service deleted out-of-band) would otherwise wire the app to a hostname
    // that no longer resolves — the exact cause of the startup DB failure.
    if (await client.databaseExists(existing.engine, existing.dokployDatabaseId)) {
      await log(`[stage:provision-databases] ✓ Reusing existing ${existing.engine} service: ${existing.dbHost}`);
      return {
        serviceType,
        engine: existing.engine,
        // The stored dbHost is the raw service appName; the app must reach it via
        // the Swarm-resolvable tasks.<appName> form (see toSwarmResolvableHost).
        host: toSwarmResolvableHost(existing.dbHost),
        port: DEFAULT_PORTS[existing.engine] ?? 0,
        database: existing.dbName ?? undefined,
        user: existing.dbUser ?? undefined,
        // The password lives only in Dokploy; on reuse we don't re-read it. The
        // app's env already carries it from the first provision, so env injection
        // only fills host/port/name/user when absent (see configure-app).
        password: "",
      };
    }

    // Stale mapping: the referenced service is gone. Clear it and recreate.
    await log(
      `[stage:provision-databases] Mapped ${existing.engine} service ${existing.dbHost} no longer exists — clearing stale mapping and recreating.`,
    );
    await deleteDatabaseMapping(projectId, serviceType);
  }

  await log(`[stage:provision-databases] Provisioning ${engine} service for "${serviceType}"...`);

  // Prefer the app's OWN credentials when it declares them. The app is already
  // configured (in its env) to connect with a specific database name, user, and
  // password; creating the container with those exact values means the schema
  // the app expects exists under the name it uses — no mismatch, no manual
  // reconciliation. We only fall back to Dockier-generated defaults when the
  // app leaves a value unset. (For redis, only the password is relevant.)
  const envVal = (name: string): string | undefined => {
    const v = envVars.find((e) => e.name === name)?.value?.trim();
    return v ? v : undefined;
  };
  const dbName = envVal("DB_DATABASE") || sanitize(deriveName(projectName)) || "appdb";
  // MySQL/Postgres images reject creating an app user named after the built-in
  // superuser ("root" for MySQL, "postgres" for Postgres) — the entrypoint
  // errors out ("MYSQL_USER=root, the user should not be used for the root
  // user"). When the app declares such a name we can't create it as the app
  // user, so fall back to the Dockier default. The provisioned env overrides
  // the app's DB_USERNAME anyway, so the app still connects with the user we
  // actually created.
  const requestedUser = envVal("DB_USERNAME");
  const reservedUsers = new Set(["root", "postgres", "mysql", "admin"]);
  const dbUser = requestedUser && !reservedUsers.has(requestedUser.toLowerCase()) ? requestedUser : "dockier";
  const dbPassword =
    (engine === "redis" ? envVal("REDIS_PASSWORD") : envVal("DB_PASSWORD")) || randomPassword();
  const serviceName = `${deriveName(projectName)}-${serviceType}`.slice(0, 60);
  const appName = `${sanitize(serviceName)}-${projectId.slice(0, 6)}`;
  const dockerImage = DEFAULT_IMAGES[engine];

  let created: DokployDatabase;
  if (engine === "redis") {
    created = await client.createRedis({
      name: serviceName,
      appName,
      environmentId,
      databasePassword: dbPassword,
      dockerImage,
      serverId,
    });
    await client.deployRedis(created.id);
  } else if (engine === "postgres") {
    created = await client.createPostgres({
      name: serviceName,
      appName,
      environmentId,
      databaseName: dbName,
      databaseUser: dbUser,
      databasePassword: dbPassword,
      dockerImage,
      serverId,
    });
    await client.deployPostgres(created.id);
  } else {
    created = await client.createMysql({
      name: serviceName,
      appName,
      environmentId,
      databaseName: dbName,
      databaseUser: dbUser,
      databasePassword: dbPassword,
      dockerImage,
      serverId,
    });
    await client.deployMysql(created.id);
  }

  await upsertDatabase({
    projectId,
    serviceType,
    engine,
    dokployDatabaseId: created.id,
    dbHost: created.appName, // internal Docker hostname
    dbName: created.databaseName ?? (engine === "redis" ? null : dbName),
    dbUser: created.databaseUser ?? (engine === "redis" ? null : dbUser),
  });

  await log(`[stage:provision-databases] ✓ ${engine} ready at ${created.appName}`);
  return {
    serviceType,
    engine,
    // Store the raw appName on the mapping (above), but hand the app the
    // Swarm-resolvable tasks.<appName> host so DB_HOST/REDIS_HOST resolve even
    // when the bare VIP service name doesn't (see toSwarmResolvableHost).
    host: toSwarmResolvableHost(created.appName),
    port: DEFAULT_PORTS[engine],
    database: created.databaseName ?? (engine === "redis" ? undefined : dbName),
    user: created.databaseUser ?? (engine === "redis" ? undefined : dbUser),
    password: created.databasePassword || dbPassword,
  };
}

/**
 * Decide the engine for a service:
 *  - cache/redis/broadcasting → redis
 *  - database → postgres if DB_CONNECTION is pgsql/postgres, else mysql
 *  - unknown → null (skip)
 */
function engineForService(svc: DeployService, envVars: Array<{ name: string; value: string }>): string | null {
  const type = svc.type.toLowerCase();
  const name = svc.name.toLowerCase();

  if (type === "cache" || type === "broadcasting" || name.includes("redis")) return "redis";

  if (type === "database" || name.includes("mysql") || name.includes("postgres") || name.includes("mariadb")) {
    // The app's DB_CONNECTION is authoritative — it's what the app will
    // actually use to connect. Only fall back to the (often generic) service
    // name label when DB_CONNECTION is absent. Checking the name first was a
    // bug: a label like "MySQL/PostgreSQL" contains "postgres" and wrongly
    // overrode an explicit DB_CONNECTION=mysql.
    const conn = (envVars.find((v) => v.name === "DB_CONNECTION")?.value ?? "").toLowerCase().trim();
    if (conn === "pgsql" || conn === "postgres" || conn === "postgresql") return "postgres";
    if (conn === "mysql" || conn === "mariadb") return "mysql";

    // No explicit DB_CONNECTION — infer from the service name, else default mysql.
    if (name.includes("postgres") && !name.includes("mysql")) return "postgres";
    return "mysql";
  }

  return null;
}

/** "owner/my-repo" or "My App" → a docker-safe base name. */
function deriveName(projectName: string): string {
  const base = projectName.split("/").pop() ?? projectName;
  return sanitize(base) || "app";
}

function sanitize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function randomPassword(): string {
  // 24 hex chars — deterministic randomness is unnecessary; the value is
  // persisted in Dokploy and injected into the app env on first provision.
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
