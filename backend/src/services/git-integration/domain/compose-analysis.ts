/**
 * Compose analysis over the git provider API (no clone).
 *
 * The I/O half of the compose feature: `lib/compose/*` is pure and knows
 * nothing about git providers, this module fetches what those functions need.
 * Three reads at most — the file tree (already in hand), the chosen compose
 * file, and, only when the entry service's port is still unknown, that
 * service's build Dockerfile.
 *
 * Distinct from `detectMultiService`, which stays: that one is a cheap
 * tree-only hint for a monorepo with NO compose file, a case compose deploys do
 * not address. When both fire, the compose analysis is the actionable one.
 */

import {
  parseCompose,
  requiredVariables,
  type ComposeService,
  type ParsedCompose,
} from "../../../lib/compose/parse.js";
import { findComposeFiles, type ComposeCandidate } from "../../../lib/compose/discovery.js";
import { pickEntryService, resolveEntryPort, isRoutable } from "../../../lib/compose/entry.js";
import { detectComposeDatabases, type ComposeDatabase } from "../../../lib/compose/databases.js";
import { fetchRepoFile, type ConnectionLike, type RepoRef } from "./providers/provider-client.js";
import { logger } from "../../../shared/logger.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";

/** One service as the wizard needs to show it. */
export interface ComposeServiceSummary {
  name: string;
  /** Resolved container port, when any signal states one. */
  port?: number;
  /** On `dokploy-network`, so Traefik can route to it. */
  routable: boolean;
  /** Exists only to build an image; never runs. */
  buildOnly: boolean;
  /** The image it runs, when it does not build one. */
  image?: string;
  /** Recognised database/cache engine, when it is one. */
  engine?: string;
}

export interface ComposeAnalysis {
  /** Every compose file in the repo, best default first. */
  candidates: ComposeCandidate[];
  /** The analysed file, repo-relative. */
  path: string;
  services: ComposeServiceSummary[];
  /** Default entry service; absent when the evidence does not single one out. */
  entryService?: string;
  /** Default container port for the entry service; absent when unknown. */
  entryPort?: number;
  /** Variables whose absence makes `docker compose` abort (`${VAR:?…}`). */
  requiredVars: string[];
  /** Databases/caches the stack runs itself — Dockier then provisions none. */
  databases: ComposeDatabase[];
  declaresDatabase: boolean;
  /** Blocking: the stack cannot deploy as-is. */
  problems: string[];
  /** Advisory. */
  warnings: string[];
}

/**
 * Analyse a repository's compose file.
 *
 * Returns `null` when the repo has none — callers read that as "checked, not a
 * compose repo", matching `detectMultiService`'s contract.
 *
 * Best-effort: any fetch or parse failure resolves to `null` rather than
 * throwing, because this runs inside the shared repo analysis that the whole
 * deploy wizard depends on. A compose file we cannot read must not take the
 * stack detection down with it.
 */
export async function analyzeComposeRepo(
  connection: ConnectionLike,
  ref: RepoRef,
  treePaths: string[],
  /** Override the ranked default, e.g. the path the user already chose. */
  preferredPath?: string,
): Promise<ComposeAnalysis | null> {
  const candidates = findComposeFiles(treePaths);
  if (candidates.length === 0) return null;

  const chosen = candidates.find((c) => c.path === preferredPath) ?? candidates[0];

  try {
    const yamlText = await fetchRepoFile(connection, ref, chosen.path);
    if (!yamlText) {
      // In the tree but unreadable. Report it rather than silently dropping to
      // a single-service deploy: the user can see the file in their repo.
      return {
        candidates,
        path: chosen.path,
        services: [],
        requiredVars: [],
        databases: [],
        declaresDatabase: false,
        problems: [`The compose file "${chosen.path}" could not be read from the repository.`],
        warnings: [],
      };
    }

    const parsed = parseCompose(yamlText, chosen.dir, treePaths);
    const entry = pickEntryService(parsed);
    const entryPort = entry
      ? resolveEntryPort(entry, await dockerfileExpose(connection, ref, entry))
      : undefined;

    const databases = detectComposeDatabases(parsed);
    const engineByService = new Map(databases.map((d) => [d.service, d.engine]));

    return {
      candidates,
      path: chosen.path,
      services: await summarise(parsed, connection, ref, engineByService),
      entryService: entry?.name,
      entryPort,
      requiredVars: requiredVariables(parsed),
      databases,
      declaresDatabase: databases.length > 0,
      problems: parsed.problems,
      warnings: [
        ...parsed.warnings,
        // A routable entry service is what makes the domain work at all, so an
        // unroutable one is called out here rather than discovered at deploy
        // time when the URL Bad Gateways.
        ...(entry && !isRoutable(entry)
          ? [
              `Service "${entry.name}" is not on the "dokploy-network" network, so no domain can be routed to it.`,
            ]
          : []),
      ],
    };
  } catch (err) {
    // Swallowed by design (the wizard falls back to a single-service deploy),
    // but logged so a systematic failure is not invisible.
    logger.warn(
      { err: getErrMsg(err), path: chosen.path },
      "[compose-analysis] failed to analyze compose file",
    );
    return null;
  }
}

/**
 * Per-service summary, resolving each service's port with the same chain the
 * entry service uses so the wizard can show a port for every row the user might
 * pick instead.
 */
async function summarise(
  parsed: ParsedCompose,
  connection: ConnectionLike,
  ref: RepoRef,
  engineByService: Map<string, string>,
): Promise<ComposeServiceSummary[]> {
  return Promise.all(
    parsed.services.map(async (service) => ({
      name: service.name,
      // Only reach for a Dockerfile when the compose file itself is silent;
      // a database or a worker never needs one fetched.
      port: resolveEntryPort(
        service,
        service.buildOnly || resolveEntryPort(service) !== undefined
          ? undefined
          : await dockerfileExpose(connection, ref, service),
      ),
      routable: isRoutable(service),
      buildOnly: service.buildOnly,
      image: service.image,
      engine: engineByService.get(service.name),
    })),
  );
}

/**
 * The first `EXPOSE` port in a service's build Dockerfile.
 *
 * The last tier of the port chain, and the one that matters most in practice:
 * a compose file that routes through Traefik labels publishes no ports at all,
 * so the image's own `EXPOSE` is the only remaining statement of where the
 * service listens.
 *
 * Returns undefined for a service that runs a prebuilt image (we cannot read
 * its Dockerfile) or when the file states no port. Never throws.
 */
async function dockerfileExpose(
  connection: ConnectionLike,
  ref: RepoRef,
  service: ComposeService,
): Promise<number | undefined> {
  // `build.dockerfile` is already resolved repo-root-relative by parseCompose;
  // a build without one uses the Docker default of a Dockerfile in the context.
  const path = service.build
    ? service.build.dockerfile ?? joinContext(service.build.context, "Dockerfile")
    : undefined;
  if (!path) return undefined;

  try {
    const content = await fetchRepoFile(connection, ref, path);
    return firstExposedPort(content);
  } catch {
    return undefined;
  }
}

function joinContext(context: string, filename: string): string {
  return context === "" ? filename : `${context}/${filename}`;
}

/**
 * First port declared by an `EXPOSE` line.
 *
 * shortcut: takes the FIRST literal port and ignores `EXPOSE $PORT` and extra
 * ports on the same line, matching `exposedPort` in repo-config.ts — a single
 * Traefik route needs exactly one. Revisit together with that one if
 * multi-port images show up.
 */
function firstExposedPort(dockerfile: string | null): number | undefined {
  const match = dockerfile?.match(/^\s*EXPOSE\s+(\d{1,5})/im);
  if (!match) return undefined;
  const port = Number(match[1]);
  return port > 0 && port <= 65535 ? port : undefined;
}
