/**
 * Docker Compose file parsing for the compose deploy strategy.
 *
 * Dokploy deploys a compose stack by cloning the repo and running the file, so
 * it never tells us anything about the file BEFORE a deploy exists. Everything
 * the wizard needs up front — which services exist, which port to route, which
 * variables must be set, whether the build contexts are even real — has to come
 * from reading the file ourselves.
 *
 * Two parsing strategies, deliberately:
 *
 *  - STRUCTURE (services, ports, networks, labels, build) comes from a real YAML
 *    parse with merge keys enabled, because compose files use anchors and `<<`.
 *  - INTERPOLATION VARIABLES come from a raw-TEXT scan, not the parsed tree.
 *    `${VAR}` appears in values anywhere at any depth (including inside anchors
 *    that are merged into several services), and a text scan finds every
 *    occurrence without walking an arbitrary structure. It also cannot be
 *    defeated by a parse failure in an unrelated part of the file.
 */

import { parse as parseYaml } from "yaml";

/** `build:` resolved against the compose file's own directory (see resolveFrom). */
export interface ComposeBuild {
  /** Repo-root-relative build context ("" means the repo root). */
  context: string;
  /** Repo-root-relative Dockerfile path, when the service names one. */
  dockerfile?: string;
}

export interface ComposeService {
  name: string;
  image?: string;
  build?: ComposeBuild;
  /**
   * CONTAINER ports from `ports:`. For "8080:3000" this is 3000 — the right
   * side. Getting this backwards routes Traefik at the host port and Bad
   * Gateways every request, so it is covered by its own tests.
   */
  ports: number[];
  /**
   * HOST ports the service explicitly binds, i.e. the LEFT side of
   * "8080:3000". Empty for `ports: - "3000"`, which publishes to an arbitrary
   * free host port and cannot collide.
   *
   * Tracked because a Dokploy server already runs Traefik on 80 and 443, so a
   * compose file binding either fails at container start with
   * "Bind for :::80 failed: port is already allocated" — after the whole stack
   * has been pulled and built.
   */
  publishedPorts: number[];
  /** Ports from `expose:` (container-only, never published to the host). */
  exposed: number[];
  /** Networks the service joins. Absent `networks:` means the default one, not ours. */
  networks: string[];
  /** Labels normalised to "key=value" strings, from either the list or map form. */
  labels: string[];
  /** Port from `traefik.http.services.*.loadbalancer.server.port`, when present. */
  traefikPort?: number;
  /** Whether the service declares its OWN Traefik router rule. */
  hasTraefikRouter: boolean;
  /**
   * A service that exists only so a deploy builds an image, and never runs.
   * Never a domain target, never counted as part of the running stack.
   */
  buildOnly: boolean;
  /**
   * `profiles:` the service belongs to.
   *
   * A service with any profile is NOT started by a plain `docker compose up` —
   * only by `up --profile <name>`. Dokploy runs the plain form, so a profiled
   * service never runs: counting it inflates the service list, and offering it
   * as a domain target points Traefik at a container that will not exist.
   *
   * This is not hypothetical. A real stack guards a destructive database
   * seeder behind `profiles: ['seed']` precisely so it cannot ride along with
   * a normal `up`.
   */
  profiles: string[];
}

/** How a `${VAR}` reference behaves when the variable is unset. */
export type VarRequirement = "required" | "optional";

export interface ComposeVariable {
  name: string;
  /**
   * "required" for `${VAR:?msg}` / `${VAR?msg}`, which make `docker compose`
   * abort when unset. Everything else is "optional": `${VAR:-default}`,
   * `${VAR-default}`, `${VAR}` and `$VAR` all resolve to a value or empty.
   */
  requirement: VarRequirement;
}

export interface ParsedCompose {
  services: ComposeService[];
  /** Root-level `networks:` entries declared `external: true`. */
  externalNetworks: string[];
  /** Every distinct `${VAR}` / `$VAR` reference in the file. */
  variables: ComposeVariable[];
  /** Blocking: the file cannot deploy as-is. */
  problems: string[];
  /** Advisory: it will deploy, but something needs the user's attention. */
  warnings: string[];
}

/** The external network Dokploy's Traefik routes through. */
export const DOKPLOY_NETWORK = "dokploy-network";

/**
 * Host ports Dokploy's Traefik already binds on every server it manages.
 *
 * A compose file publishing either cannot start: Docker reports
 * "Bind for :::80 failed: port is already allocated". Nothing in the stack is
 * at fault — the port simply is not available on this kind of host.
 */
const TRAEFIK_PORTS = new Set([80, 443]);

/**
 * Parse a compose file.
 *
 * @param yamlText  raw file contents.
 * @param composeDir repo-root-relative DIRECTORY holding the file (e.g.
 *   "deploy/dokploy"). Build contexts are relative to THIS, not the repo root —
 *   a `context: ../..` in deploy/dokploy means the repo root. Resolving against
 *   the root instead reports every context as missing.
 * @param treePaths  the repo's file tree, used to verify build contexts and
 *   Dockerfiles actually exist. Pass [] to skip those checks.
 */
export function parseCompose(
  yamlText: string,
  composeDir: string,
  treePaths: string[] = [],
): ParsedCompose {
  const problems: string[] = [];
  const warnings: string[] = [];

  let doc: unknown;
  try {
    // merge: true resolves `<<: *anchor`, which real compose files rely on.
    // Without it the merge key surfaces as a literal "<<" field and the merged
    // values are invisible.
    doc = parseYaml(yamlText, { merge: true });
  } catch (err) {
    return {
      services: [],
      externalNetworks: [],
      variables: scanVariables(yamlText),
      problems: [`The compose file is not valid YAML: ${errText(err)}`],
      warnings: [],
    };
  }

  const root = asRecord(doc);
  const serviceMap = asRecord(root?.services);

  if (!serviceMap || Object.keys(serviceMap).length === 0) {
    problems.push("The compose file declares no services.");
  }

  const services = Object.entries(serviceMap ?? {}).map(([name, raw]) =>
    parseService(name, asRecord(raw) ?? {}, composeDir),
  );

  // Build contexts are the single most common way a compose file goes stale:
  // directories get renamed and the file keeps pointing at the old path, so
  // `docker compose up` cannot work at all. Checking it here turns a failed
  // deploy into a message in the wizard.
  if (treePaths.length > 0) {
    const tree = new Set(treePaths.map(normalizePath));
    for (const svc of services) {
      if (!svc.build) continue;
      if (!dirExists(svc.build.context, tree)) {
        problems.push(
          `Service "${svc.name}" builds from "${svc.build.context || "."}", which does not exist in this repository.`,
        );
        continue;
      }
      if (svc.build.dockerfile && !tree.has(svc.build.dockerfile)) {
        problems.push(
          `Service "${svc.name}" names the Dockerfile "${svc.build.dockerfile}", which does not exist in this repository.`,
        );
      }
    }
  }

  // A Dokploy server runs Traefik on 80 and 443. A compose file that binds
  // either gets "Bind for :::80 failed: port is already allocated" at container
  // start — AFTER every image has been pulled and built, which is the most
  // expensive possible moment to find out. This is a PROBLEM, not a warning:
  // the deploy cannot succeed, and the fix is a one-line compose change.
  for (const svc of services) {
    const reserved = svc.publishedPorts.filter((port) => TRAEFIK_PORTS.has(port));
    if (reserved.length === 0) continue;
    problems.push(
      `Service "${svc.name}" publishes host port ${reserved.join(" and ")}, which Dokploy's reverse proxy ` +
      `already uses. Remove the host side of the mapping (use "${reserved[0] === 443 ? 443 : 80}" instead of ` +
      `"${reserved[0]}:${reserved[0]}") and attach the service to the "${DOKPLOY_NETWORK}" network — the proxy ` +
      `routes your domain to it without a host port.`,
    );
  }

  const externalNetworks = Object.entries(asRecord(root?.networks) ?? {})
    .filter(([, cfg]) => asRecord(cfg)?.external === true)
    .map(([name]) => name);

  // Traefik can only reach a service attached to the external dokploy-network.
  // We warn rather than block: an internal-only stack is a legitimate thing to
  // deploy, and rewriting the user's file would make Dokploy's own
  // getConvertedCompose useless as a diagnostic.
  const runnable = services.filter((s) => !s.buildOnly && s.profiles.length === 0);
  if (runnable.length > 0 && !runnable.some((s) => s.networks.includes(DOKPLOY_NETWORK))) {
    warnings.push(
      `No service joins the "${DOKPLOY_NETWORK}" network, so Traefik cannot route a domain to this stack. ` +
      `Add "${DOKPLOY_NETWORK}" to the public service's networks, and declare it at the top level with "external: true".`,
    );
  } else if (
    runnable.some((s) => s.networks.includes(DOKPLOY_NETWORK)) &&
    !externalNetworks.includes(DOKPLOY_NETWORK)
  ) {
    warnings.push(
      `Services reference "${DOKPLOY_NETWORK}" but it is not declared at the top level with "external: true", ` +
      `so Compose will create a separate network of its own instead of joining Dokploy's.`,
    );
  }

  return { services, externalNetworks, variables: scanVariables(yamlText), problems, warnings };
}

// ─── Services ────────────────────────────────────────────────────

function parseService(name: string, raw: Record<string, unknown>, composeDir: string): ComposeService {
  const labels = parseLabels(raw.labels);

  return {
    name,
    image: typeof raw.image === "string" ? raw.image : undefined,
    build: parseBuild(raw.build, composeDir),
    ports: parsePorts(raw.ports),
    publishedPorts: parsePublishedPorts(raw.ports),
    exposed: toPortList(raw.expose),
    networks: parseNetworks(raw.networks),
    labels,
    traefikPort: traefikServicePort(labels),
    hasTraefikRouter: labels.some((l) => /^traefik\.http\.routers\..+\.rule=/.test(l)),
    profiles: Array.isArray(raw.profiles)
      ? raw.profiles.filter((p): p is string => typeof p === "string")
      : [],
    buildOnly: isBuildOnly(raw),
  };
}

/**
 * Services a plain `docker compose up` actually starts.
 *
 * Excludes build-only pseudo-services and anything behind a `profiles:` gate.
 * This is the set that matters for counting the stack and for choosing a
 * domain target — Dokploy runs `up` without `--profile`.
 */
export function runnableServices(parsed: ParsedCompose): ComposeService[] {
  return parsed.services.filter((s) => !s.buildOnly && s.profiles.length === 0);
}

/**
 * A build-only pseudo-service: it exists so the deploy produces an image that
 * something else runs later, and it never serves traffic itself.
 *
 * Only two unambiguous signals are used. `restart: "no"` is deliberately NOT
 * one of them — a genuine one-shot migration job uses it and still belongs to
 * the running stack.
 */
function isBuildOnly(raw: Record<string, unknown>): boolean {
  if (raw.network_mode === "none") return true;
  const entry = raw.entrypoint;
  if (entry === "true") return true;
  if (Array.isArray(entry) && entry.length === 1 && entry[0] === "true") return true;
  return false;
}

function parseBuild(raw: unknown, composeDir: string): ComposeBuild | undefined {
  // Short form: `build: ./app` is the context with no Dockerfile override.
  if (typeof raw === "string") return { context: resolveFrom(composeDir, raw) };

  const obj = asRecord(raw);
  if (!obj) return undefined;

  const context = resolveFrom(composeDir, typeof obj.context === "string" ? obj.context : ".");
  // `dockerfile` is relative to the CONTEXT, not to the compose file.
  const dockerfile =
    typeof obj.dockerfile === "string" ? resolveFrom(context, obj.dockerfile) : undefined;

  return { context, dockerfile };
}

/** `networks:` is either a list of names or a map keyed by name. */
function parseNetworks(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((n): n is string => typeof n === "string");
  const obj = asRecord(raw);
  return obj ? Object.keys(obj) : [];
}

/** `labels:` is either a list of "k=v" strings or a map. Normalise to "k=v". */
function parseLabels(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((l): l is string => typeof l === "string");
  }
  const obj = asRecord(raw);
  if (!obj) return [];
  return Object.entries(obj).map(([k, v]) => `${k}=${stringify(v)}`);
}

function traefikServicePort(labels: string[]): number | undefined {
  for (const label of labels) {
    const match = /^traefik\.http\.services\..+\.loadbalancer\.server\.port=(\d{1,5})$/.exec(label);
    if (match) {
      const port = Number(match[1]);
      if (isPort(port)) return port;
    }
  }
  return undefined;
}

// ─── Ports ───────────────────────────────────────────────────────

/**
 * Container ports from `ports:`, in declaration order.
 *
 * Every published form maps to the CONTAINER port:
 *   3000                      → 3000
 *   "3000"                    → 3000
 *   "8080:3000"               → 3000   (right side)
 *   "127.0.0.1:8080:3000"     → 3000   (last segment)
 *   "8080:3000/tcp"           → 3000
 *   "3000-3002"               → 3000   (first of the range)
 *   {target: 3000, ...}       → 3000   (long form)
 */
function parsePorts(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];

  for (const entry of raw) {
    // Long form: the container port is `target`, `published` is the host side.
    const obj = asRecord(entry);
    if (obj) {
      const target = toPort(obj.target);
      if (target !== undefined) out.push(target);
      continue;
    }

    if (typeof entry === "number") {
      if (isPort(entry)) out.push(entry);
      continue;
    }
    if (typeof entry !== "string") continue;

    // Strip the protocol suffix, then take the LAST colon-separated segment:
    // that is the container port in every short form, including the
    // ip:host:container one.
    const spec = entry.split("/")[0];
    const last = spec.split(":").pop() ?? "";
    // A range ("3000-3002") publishes several; the first is what a single
    // Traefik route can target.
    const port = toPort(last.split("-")[0]);
    if (port !== undefined) out.push(port);
  }

  return out;
}

/**
 * HOST ports a service explicitly binds — the left side of "8080:3000".
 *
 *   "8080:3000"            → 8080
 *   "127.0.0.1:8080:3000"  → 8080   (middle segment)
 *   "3000"                 → none   (arbitrary free host port, cannot collide)
 *   {published: 8080, …}   → 8080   (long form)
 *   "8000-8002:3000-3002"  → 8000   (first of the range)
 *
 * The distinction matters: only an EXPLICIT host port can collide with
 * Traefik. Treating a bare "3000" as a host binding would warn on files that
 * are perfectly fine.
 */
function parsePublishedPorts(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];

  for (const entry of raw) {
    const obj = asRecord(entry);
    if (obj) {
      const published = toPort(String(obj.published ?? "").split("-")[0]);
      if (published !== undefined) out.push(published);
      continue;
    }
    // A bare number publishes the CONTAINER port to an arbitrary host port.
    if (typeof entry !== "string") continue;

    const segments = entry.split("/")[0].split(":");
    // One segment is the bare container-port form — no host binding.
    if (segments.length < 2) continue;
    // Two segments: host:container. Three: ip:host:container.
    const hostSegment = segments[segments.length - 2];
    const port = toPort(hostSegment.split("-")[0]);
    if (port !== undefined) out.push(port);
  }

  return out;
}

/** `expose:` is a flat list of container ports (numbers or strings). */
function toPortList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(toPort).filter((p): p is number => p !== undefined);
}

function toPort(value: unknown): number | undefined {
  const port = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return isPort(port) ? port : undefined;
}

function isPort(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

// ─── Interpolation variables ─────────────────────────────────────

/**
 * Every `${VAR}` / `$VAR` reference in the raw file, de-duplicated.
 *
 * `${VAR:?msg}` and `${VAR?msg}` make `docker compose` ABORT when the variable
 * is unset, so they are the set worth blocking a deploy on — the alternative is
 * the user reading a build log they have no access to.
 *
 * `$$` is Compose's escape for a literal `$` (it appears in Traefik regex
 * rules), so it is consumed by its own alternative before the variable forms
 * can match it.
 */
export function scanVariables(text: string): ComposeVariable[] {
  // The `:` before the operator is OUTSIDE the capture: `${VAR:?msg}` and
  // `${VAR?msg}` both abort on an unset variable, and `${VAR:-d}` / `${VAR-d}`
  // both substitute, so the colon carries no meaning we can act on. Capturing
  // the operator ALONE matters — folding it together with its message yields
  // ":?msg" and nothing ever compares equal to an operator.
  const pattern = /\$\$|\$\{([A-Za-z_]\w*)(?::?([-?+])[^}]*)?\}|\$([A-Za-z_]\w*)/g;
  // A variable counts as required if ANY reference to it is required: one
  // `${VAR:?}` anywhere aborts the whole `docker compose` run, however many
  // defaulted references sit elsewhere in the file.
  const required = new Map<string, boolean>();

  for (const match of text.matchAll(pattern)) {
    const [raw, braced, operator, bare] = match;
    if (raw === "$$") continue;

    const name = braced ?? bare;
    if (!name) continue;

    required.set(name, (required.get(name) ?? false) || operator === "?");
  }

  return [...required].map(([name, isRequired]) => ({
    name,
    requirement: isRequired ? "required" : "optional",
  }));
}

/** Names of the variables that must be set or `docker compose` refuses to run. */
export function requiredVariables(parsed: ParsedCompose): string[] {
  return parsed.variables.filter((v) => v.requirement === "required").map((v) => v.name);
}

// ─── Paths ───────────────────────────────────────────────────────

/**
 * Resolve a compose-relative path to a repo-root-relative one.
 *
 * `resolveFrom("deploy/dokploy", "../..")` → "" (the repo root).
 * Returns "" for the repo root rather than "." so it composes with joinPath
 * and with the flat, root-relative tree paths from the git providers.
 *
 * `..` beyond the root is clamped, not an error: a compose file in a checkout
 * cannot reach outside it, and Dokploy would fail the build anyway.
 */
export function resolveFrom(baseDir: string, relative: string): string {
  const segments = normalizePath(baseDir).split("/").filter(Boolean);

  for (const part of normalizePath(relative).split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }

  return segments.join("/");
}

/** Whether a directory is present in a flat file tree ("" is the repo root). */
function dirExists(dir: string, tree: Set<string>): boolean {
  if (dir === "") return true;
  if (tree.has(dir)) return true;
  const prefix = `${dir}/`;
  for (const path of tree) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+/g, "/").replace(/\/$/, "");
}

// ─── Small helpers ───────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringify(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message.split("\n")[0] : String(err);
}
