import type { MultiServiceHint, Provider } from "@/types";

export type { Provider };

export interface DetectedService {
  type: string;
  name: string;
  provider: string;
  confidence: number;
  configFile?: string;
}

export interface AIAnalysis {
  runtime: string;
  runtimeVersion: string;
  framework: string;
  frameworkVersion: string;
  buildCommand: string;
  startCommand: string;
  port: number;
  needsScheduler: boolean;
  needsQueueWorker: boolean;
  needsWebsockets: boolean;
  envVars: string[];
  nginxConfig: string;
  summary: string;
  description?: string;
  sections?: {
    overview: string;
    howItWorks: string;
    techStack: string;
    architecture: string;
    dataStorage: string;
    codeQuality: string;
    security: string;
    deployment: string;
  };
  dataFlow?: {
    entities: Array<{
      name: string;
      description: string;
      storage: string;
      fields: Array<{
        name: string;
        type: string;
        sensitivity: "public" | "internal" | "personal" | "sensitive" | "secret";
      }>;
    }>;
  };
  userJourney?: UserJourneyNode;
}

export interface UserJourneyNode {
  label: string;
  icon?: string;
  children?: UserJourneyNode[];
}

export interface RepoAnalysis {
  techStack: Array<{ name: string; category: string; confidence: number }>;
  deployOptions: Array<{
    provider: string;
    type: string;
    description: string;
    pros: string[];
    cons: string[];
    estimatedMonthlyCost: string;
    bestFor: string;
  }>;
  detectedServices: DetectedService[];
  repoSize: number;
  primaryLanguage: string;
  hasDocker: boolean;
  hasCi: boolean;
  /**
   * Whether the repo can be served as a static site. `false` is a CONFIDENT
   * server-only verdict (Laravel/Django/SSR/etc.); `undefined` means undecided
   * → show both deploy targets.
   */
  staticCapable?: boolean;
  /**
   * Database engine from a committed `.env.example` (`DB_CONNECTION`), e.g.
   * "mysql" | "pgsql" | "sqlite". A real file value, preferred over the AI's
   * guessed env vars when labelling the database service.
   */
  detectedDbEngine?: string;
  /**
   * Present when the repo looks like it holds more than one deployable service
   * (app manifests in two or more directories, or a compose file beside
   * Dockerfiles in two or more directories). Informational
   * only — drives a warning in the Analysis step, never blocks the wizard.
   */
  multiService?: MultiServiceHint | null;
  /**
   * Present when the repo holds a Docker Compose file. Unlike `multiService`
   * (which only warns), this is actionable: it drives the compose deploy
   * strategy. When both are set the wizard shows this and hides the warning.
   *
   * `null` means checked and no compose file.
   */
  compose?: ComposeAnalysis | null;
  aiAnalysis?: AIAnalysis;
  sensitiveData?: SensitiveField[];
  dependencies?: Dependency[];
}

/** One service declared in the compose file. */
export interface ComposeServiceSummary {
  name: string;
  /**
   * Container port, when any signal states one: `ports:`, `expose:`, a Traefik
   * label, or the service's build Dockerfile `EXPOSE`. Absent means the user
   * has to supply it — Dokploy routes Traefik to this exact port, so a guess
   * is a permanent Bad Gateway.
   */
  port?: number;
  /** On `dokploy-network`, so Traefik can reach it. */
  routable: boolean;
  /** Exists only to build an image; never runs, never a domain target. */
  buildOnly: boolean;
  /** Behind a `profiles:` gate, so a plain `docker compose up` skips it. */
  profiled: boolean;
  /**
   * Whether this service actually runs on a deploy. Prefer this over checking
   * `buildOnly` — a profiled service does not run either, and filtering on one
   * condition silently counts and offers containers that never start.
   */
  startsByDefault: boolean;
  image?: string;
  /** Recognised database/cache engine, when it is one. */
  engine?: string;
}

/** A compose file found in the repo, with why it was ranked where it was. */
export interface ComposeCandidate {
  path: string;
  dir: string;
  reason: string;
}

export interface ComposeAnalysis {
  /** Every compose file in the repo, best default first. */
  candidates: ComposeCandidate[];
  /** The analysed file. */
  path: string;
  services: ComposeServiceSummary[];
  /** Suggested public service; absent when the evidence names none. */
  entryService?: string;
  entryPort?: number;
  /** Variables the file marks `${VAR:?…}` — unset ones abort the deploy. */
  requiredVars: string[];
  /** Databases the stack runs itself; Dockier then provisions none. */
  databases: Array<{ service: string; engine: string; serviceType: string; image: string }>;
  declaresDatabase: boolean;
  /** Blocking: the stack cannot deploy as-is. */
  problems: string[];
  /** Advisory. */
  warnings: string[];
}

export interface SensitiveField {
  entity: string;
  field: string;
  sensitivity: "personal" | "sensitive" | "secret";
  reason: string;
}

export interface Dependency {
  name: string;
  version: string;
  type: "production" | "dev";
  ecosystem: "npm" | "composer" | "pip" | "gem" | "go" | "cargo";
  repoUrl: string;
  latestVersion?: string;
  status: "active" | "outdated" | "deprecated" | "unknown";
  vulnerabilities: Array<{
    id: string;
    severity: "critical" | "high" | "medium" | "low";
    title: string;
    details: string;
    aliases: string[];
    url: string;
  }>;
}

export interface WizardState {
  // Step 1
  selectedProvider: string;
  selectedProviderId: string;
  /**
   * Where the app runs.
   *  - "vps"     → a virtual machine (EC2 / Compute Engine) via Dokploy
   *  - "static"  → object storage + CDN (S3 + CloudFront / GCS + Cloud CDN)
   *  - "compose" → the repo's own Docker Compose file, run as one stack of N
   *    containers on a VM via Dokploy. Offered only when analysis found a
   *    compose file.
   *
   * Chosen in the Plan step. Once repo analysis exposes a static/server
   * classification, this should be pre-selected from it rather than left to the
   * user to get right — see .kiro/specs/static-deploy-targets task 3.
   */
  deployStrategy: "vps" | "static" | "compose";
  /**
   * The user's compose choices, persisted to `projects.settings.compose` on
   * deploy. Which file to run, and which of its services gets the domain.
   *
   * Kept out of the deploy request body on purpose: these must survive a
   * redeploy and a rollback, and be editable later without running a deploy,
   * so the pipeline reads them from project settings instead.
   */
  compose: {
    path: string;
    entryService?: string;
    entryPort?: number;
  };
  // Env Vars
  envVars: Array<{ name: string; value: string }>;
  // Analysis
  /**
   * Whether to build from the repository's own Dockerfile (true, the default
   * when one exists) or let the platform's builder generate the image (false).
   * Sent as `buildMethod` so it persists on the deployment row and a
   * redeploy/rollback reuses the same choice. Ignored when the repo has no
   * Dockerfile — the Analysis step only offers the choice when it detects one.
   */
  useRepoDockerfile: boolean;
  servicesModes: Record<string, "vps" | "external">;
  envDetectionHints: Record<string, string>;
  manualServiceOverrides: string[];
  // Plan
  environment: "staging" | "production";
  selectedPlan: number;
  // Region
  tofuRegion: string;
  // Deploy
  deploymentId: string;
  deployStatus: "" | "pending" | "building" | "deploying" | "success" | "failed" | "destroyed" | "cancelled";
  deployLogs: string[];
  deployAppUrl: string;
}

export interface DeployWizardProps {
  open: boolean;
  onClose: () => void;
  project: { id: string; name: string; repository: string; branch: string; connectionId: string; sourceType?: string; template?: string };
  analysis: RepoAnalysis | null;
  analysisLoading?: boolean;
  analysisError?: string;
  providers: Provider[];
  onDeployComplete?: () => void;
}

export interface Plan {
  tier: "value" | "balanced" | "performance" | "standard";
  label: string;
  badge: string;
  badgeColor: string;
  instance: string;
  cpu: string;
  ram: string;
  storage: string;
  network: string;
  externalServices: string[];
  monthlyPrice: string;
  breakdown: Array<{ item: string; cost: string }>;
}
