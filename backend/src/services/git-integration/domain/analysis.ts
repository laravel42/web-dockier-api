import type { ConnectionLike, RepoRef } from "./providers/provider-client.js";
import { fetchRepoFile, getRepoFileTree } from "./providers/provider-client.js";
import { scanDependencies, type Dependency } from "./dependency-scanner.js";
import { suggestDeployOptions } from "./deploy-options.js";
import { detectServices, type DetectedService } from "./services.js";
import { detectTechStack, type TechStackItem } from "./tech-stack.js";
import { scanSensitiveData, type SensitiveField } from "./sensitive-data-scanner.js";
import { detectStaticCapable } from "./repo-config.js";
import { detectMultiService, type MultiServiceHint } from "./multi-service.js";
import { analyzeComposeRepo, type ComposeAnalysis } from "./compose-analysis.js";

export type { SensitiveField } from "./sensitive-data-scanner.js";

export type SensitiveColumn = {
  name: string;
  type: string;
  category: SensitiveField["sensitivity"];
  sensitivity: "critical" | "high" | "medium";
  reason: string;
  confidence: number;
};

export type SensitiveTable = {
  name: string;
  riskScore: number;
  columns: SensitiveColumn[];
};

export function analyzeSensitiveDataFromText(schema: string): { tables: SensitiveTable[]; summary: { totalTables: number; highRiskTables: number; criticalFindings: string[] } } {
  if (!schema.trim()) {
    return { tables: [], summary: { totalTables: 0, highRiskTables: 0, criticalFindings: [] } };
  }

  const fields = scanSensitiveData({ "schema.sql": schema }, {});
  return sensitiveFieldsToAnalysisResult(fields);
}

function sensitiveFieldsToAnalysisResult(fields: SensitiveField[]): {
  tables: SensitiveTable[];
  summary: { totalTables: number; highRiskTables: number; criticalFindings: string[] };
} {
  const grouped = new Map<string, SensitiveField[]>();
  for (const finding of fields) {
    const bucket = grouped.get(finding.entity) ?? [];
    bucket.push(finding);
    grouped.set(finding.entity, bucket);
  }

  const tables: SensitiveTable[] = Array.from(grouped.entries()).map(([name, columns]) => ({
    name,
    riskScore: Math.min(100, columns.length * 20 + (columns.some((c) => c.sensitivity === "secret") ? 40 : 0)),
    columns: columns.map((column) => ({
      name: column.field,
      type: "unknown",
      category: column.sensitivity,
      sensitivity: (column.sensitivity === "secret" ? "critical" : column.sensitivity === "sensitive" ? "high" : "medium") as "critical" | "high" | "medium",
      reason: column.reason,
      confidence: 0.85,
    })),
  }));

  return {
    tables,
    summary: {
      totalTables: tables.length,
      highRiskTables: tables.filter((table) => table.riskScore >= 61).length,
      criticalFindings: tables.filter((table) => table.riskScore >= 81).map((table) => `${table.name} contains high-risk secret fields`),
    },
  };
}

export type RepoAnalysisResult = {
  techStack: TechStackItem[];
  deployOptions: Array<{ provider: string; type: string; description: string }>;
  detectedServices: DetectedService[];
  repoSize: number;
  primaryLanguage: string;
  hasDocker: boolean;
  hasCi: boolean;
  /**
   * Whether the repo can be deployed as a static site. `false` means CONFIDENT
   * server-only (Laravel/Django/SSR/etc.); `undefined` means the stack could
   * not be determined → treat as uncertain. Derived from the deploy-time
   * static gate so the wizard never diverges from it.
   */
  staticCapable?: boolean;
  /**
   * The database engine parsed authoritatively from a committed `.env.example`
   * (`DB_CONNECTION`), e.g. "mysql" | "pgsql" | "sqlite". Lowercased, verbatim.
   *
   * This is a FILE value, not an AI guess — Dockier never reads the real `.env`,
   * so the AI's `envVars` can invent an engine (it tends to default to
   * Postgres). When present, the wizard prefers this over the guessed env vars.
   * `undefined` when no `.env.example` exists or it declares no `DB_CONNECTION`.
   */
  detectedDbEngine?: string;
  /**
   * Set when the repo looks like it holds more than one deployable service
   * (app manifests in two or more directories, or a compose file beside
   * Dockerfiles in two or more directories). Feeds the
   * wizard's informational "only one service is deployed" warning.
   *
   * `null` means checked and single-service; `undefined` means the analysis was
   * cached before this field existed (the route backfills those).
   */
  multiService?: MultiServiceHint | null;
  /**
   * Set when the repo holds a Docker Compose file: every candidate file, the
   * services the chosen one declares, the default entry service and port, the
   * variables that must be set, and whether the stack runs its own database.
   * Drives the compose deploy strategy.
   *
   * Related to but distinct from `multiService`: that one is a tree-only hint
   * about a monorepo with no compose file, a case compose deploys cannot help.
   * When both are set, this one is the actionable signal and the wizard shows
   * it instead of the warning.
   *
   * `null` means checked and no compose file (or it could not be analysed);
   * `undefined` means the analysis was cached before this field existed (the
   * route backfills those).
   */
  compose?: ComposeAnalysis | null;
  sensitiveData?: SensitiveField[];
  dependencies?: Dependency[];
  _scannersRan: boolean;
};

const DEPENDENCY_FRAMEWORKS: Record<string, TechStackItem> = {
  react: { name: "React", category: "framework", confidence: 95 },
  vue: { name: "Vue", category: "framework", confidence: 95 },
  "@angular/core": { name: "Angular", category: "framework", confidence: 95 },
  svelte: { name: "Svelte", category: "framework", confidence: 95 },
  next: { name: "Next.js", category: "framework", confidence: 95 },
  nuxt: { name: "Nuxt", category: "framework", confidence: 95 },
  "@remix-run/react": { name: "Remix", category: "framework", confidence: 95 },
  astro: { name: "Astro", category: "framework", confidence: 95 },
  express: { name: "Express", category: "framework", confidence: 90 },
  fastify: { name: "Fastify", category: "framework", confidence: 90 },
  "@nestjs/core": { name: "NestJS", category: "framework", confidence: 90 },
  hono: { name: "Hono", category: "framework", confidence: 90 },
  "laravel/framework": { name: "Laravel", category: "framework", confidence: 95 },
  "symfony/symfony": { name: "Symfony", category: "framework", confidence: 95 },
  "@inertiajs/react": { name: "Inertia.js", category: "framework", confidence: 90 },
  "@inertiajs/vue3": { name: "Inertia.js", category: "framework", confidence: 90 },
  livewire: { name: "Livewire", category: "framework", confidence: 90 },
  "filament/filament": { name: "Filament", category: "framework", confidence: 90 },
  django: { name: "Django", category: "framework", confidence: 90 },
  flask: { name: "Flask", category: "framework", confidence: 90 },
  fastapi: { name: "FastAPI", category: "framework", confidence: 90 },
  "rails": { name: "Rails", category: "framework", confidence: 90 },
  "@prisma/client": { name: "Prisma", category: "database", confidence: 90 },
  drizzle: { name: "Drizzle ORM", category: "database", confidence: 90 },
  "tailwindcss": { name: "Tailwind CSS", category: "tool", confidence: 90 },
  "@mui/material": { name: "Material UI", category: "tool", confidence: 85 },
  "@chakra-ui/react": { name: "Chakra UI", category: "tool", confidence: 85 },
  antd: { name: "Ant Design", category: "tool", confidence: 85 },
  "react-native": { name: "React Native", category: "framework", confidence: 90 },
};

function enrichTechStackFromDependencies(
  techStack: TechStackItem[],
  dependencies: Dependency[],
): TechStackItem[] {
  const merged = new Map(techStack.map((item) => [item.name, item]));
  for (const dep of dependencies) {
    const framework = DEPENDENCY_FRAMEWORKS[dep.name];
    if (framework && !merged.has(framework.name)) {
      merged.set(framework.name, framework);
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.confidence - a.confidence);
}

const CONFIG_FILES_TO_FETCH = [
  "package.json",
  "composer.json",
  "requirements.txt",
  "pyproject.toml",
  "Gemfile",
  "prisma/schema.prisma",
  "go.mod",
  "Cargo.toml",
  // Read for its DB_CONNECTION value — an authoritative, local, non-secret
  // signal for the database engine. The real .env is never read; .env.example
  // ships committed with the project's intended engine (Laravel: mysql, or
  // sqlite on Laravel 11+).
  ".env.example",
];

/**
 * Parse the database engine from a committed `.env.example`'s `DB_CONNECTION`.
 *
 * Returns the lowercased value (e.g. "mysql", "pgsql", "sqlite") or `undefined`
 * when no `.env.example` was fetched or it declares no `DB_CONNECTION`. This is
 * a real file value, deliberately preferred over the AI's guessed env vars.
 */
/**
 * Fetch `.env.example` and parse its `DB_CONNECTION`, standalone.
 *
 * Used to backfill `detectedDbEngine` onto an analysis cached before the field
 * existed, without re-running the whole analysis. Best-effort: returns
 * `undefined` on any fetch failure or when no engine is declared.
 */
export async function detectDbEngine(
  connection: ConnectionLike,
  ref: RepoRef,
): Promise<string | undefined> {
  try {
    const files = await getRepoFileTree(connection, ref);
    const path = files.find((file) => file.toLowerCase().endsWith(".env.example"));
    if (!path) return undefined;
    const content = await fetchRepoFile(connection, ref, path);
    if (!content) return undefined;
    return parseDbEngineFromEnvExample({ [path]: content });
  } catch {
    return undefined;
  }
}

export function parseDbEngineFromEnvExample(configFiles: Record<string, string>): string | undefined {
  const entry = Object.entries(configFiles).find(([path]) =>
    path.toLowerCase().endsWith(".env.example"),
  );
  if (!entry) return undefined;

  for (const rawLine of entry[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^DB_CONNECTION\s*=\s*(.+)$/i.exec(line);
    if (!match) continue;
    // Strip a trailing inline comment FIRST, then surrounding quotes — doing it
    // the other way leaves the closing quote on `"mysql" # comment`.
    const value = match[1]
      .trim()
      .split(/\s+#/)[0]
      .trim()
      .replace(/^["']|["']$/g, "")
      .trim()
      .toLowerCase();
    return value || undefined;
  }
  return undefined;
}

/**
 * Whether the repo has a Dockerfile a deploy could actually build from.
 *
 * ONLY the repo ROOT counts. Dokploy's `dockerfile` build type is configured
 * with `dockerfile: "./Dockerfile"` and context `./` (see `configure-app`), so
 * a Dockerfile anywhere else cannot be used by that path.
 *
 * This was `files.some(f => /Dockerfile/i.test(f))` — ANY path *containing*
 * "Dockerfile". A monorepo of containerised plugins reported `hasDocker: true`
 * from 96 `plugins/<name>/Dockerfile` entries with none at the root, so the
 * wizard offered "Use my Dockerfile" for a file that does not exist. The deploy
 * pipeline was unaffected (`resolve-runtime` checks `files.exists("Dockerfile")`
 * and its verdict wins over `event.hasDocker`), so the damage was confined to
 * the UI — but it presented a choice that could not be honoured.
 *
 * Exact match, not a suffix: `Dockerfile.prod` and `my.Dockerfile` are not the
 * file the build type points at either. Case-sensitive, because Docker itself
 * is on a case-sensitive filesystem and `dockerfile` would not be found.
 */
export function hasRootDockerfile(files: string[]): boolean {
  return files.some((file) => file.replace(/^\.\//, "") === "Dockerfile");
}

export async function runRepoAnalysis(connection: ConnectionLike, ref: RepoRef): Promise<RepoAnalysisResult> {
  const files = await getRepoFileTree(connection, ref);
  const techStack = detectTechStack(files);
  const hasDocker = hasRootDockerfile(files);
  const hasCi = files.some((file) => /\.github\/workflows\/|\.gitlab-ci\.yml|Jenkinsfile|\.circleci/i.test(file));

  const configFiles: Record<string, string> = {};
  for (const candidate of CONFIG_FILES_TO_FETCH) {
    const path = files.find((file) => file.toLowerCase().endsWith(candidate.toLowerCase()));
    if (!path) continue;
    const content = await fetchRepoFile(connection, ref, path);
    if (content) configFiles[path] = content;
  }

  const dependencies = await scanDependencies(configFiles);
  const mergedTechStack = enrichTechStackFromDependencies(techStack, dependencies);
  // Detect services from declared dependencies (strongest signal) plus anchored
  // config/migration files. Runs after the dependency scan so package names feed in.
  const detectedServices = detectServices(files, dependencies);

  // Static-capability from the same gate the deploy pipeline uses. Best-effort:
  // detectStaticCapable never throws (undefined on failure → wizard shows both
  // deploy targets).
  const staticCapable = await detectStaticCapable(connection, ref);
  const detectedDbEngine = parseDbEngineFromEnvExample(configFiles);

  // Compose analysis over the tree we already have. Best-effort:
  // analyzeComposeRepo never throws (null on failure), so a compose file we
  // cannot read falls back to a single-service deploy rather than failing the
  // whole analysis the deploy wizard depends on.
  const compose = await analyzeComposeRepo(connection, ref, files);

  return {
    techStack: mergedTechStack,
    deployOptions: suggestDeployOptions(mergedTechStack, hasDocker, files.length).map((option) => ({
      provider: option.provider,
      type: option.type,
      description: option.description,
    })),
    detectedServices,
    multiService: detectMultiService(files),
    compose,
    repoSize: files.length,
    primaryLanguage: mergedTechStack.find((item) => item.category === "language" || item.category === "runtime")?.name ?? "",
    hasDocker,
    hasCi,
    staticCapable,
    detectedDbEngine,
    dependencies: dependencies.length > 0 ? dependencies : undefined,
    _scannersRan: true,
  };
}
