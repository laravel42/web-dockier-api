import type { Provider } from "../../types";
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
  aiAnalysis?: AIAnalysis;
  sensitiveData?: SensitiveField[];
  dependencies?: Dependency[];
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
  // Step 2
  deployStrategy: "vps" | "managed" | "static";
  // Step 3 (Env Vars)
  envVars: Array<{ name: string; value: string }>;
  // Step 4 (Analysis)
  servicesModes: Record<string, "vps" | "managed">;
  envDetectionHints: Record<string, string>;
  manualServiceOverrides: string[];
  // Step 5 (Plan)
  environment: "staging" | "production";
  selectedPlan: number;
  // Step 6 (Config)
  tofuScript: string;
  tofuResources: string[];
  tofuAppName: string;
  tofuRegion: string;
  useDocker: boolean;
  /** When true, keep the repo's Dockerfile instead of Dockier generating one. */
  useRepoDockerfile: boolean;
  buildMethod: "dockerfile" | "railpack" | "nixpacks" | "codebuild";
  // Step 7 (Deploy)
  deploymentId: string;
  deployStatus: "" | "pending" | "building" | "deploying" | "success" | "failed" | "destroyed" | "cancelled";
  deployLogs: string[];
  deployAppUrl: string;
  codebuildBuildId: string;
  codebuildImageUri: string;
  codebuildLogsUrl: string;
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
  managedServices: string[];
  monthlyPrice: string;
  breakdown: Array<{ item: string; cost: string }>;
}
