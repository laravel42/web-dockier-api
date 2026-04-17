export type { Provider } from "../../types";

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
  postDeployCommands: string[];
  nginxConfig: string;
  summary: string;
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
}

export interface WizardState {
  // Step 1
  selectedProvider: string;
  selectedProviderId: string;
  // Step 2
  deployStrategy: "vps" | "managed" | "static";
  // Step 3
  servicesModes: Record<string, "vps" | "managed">;
  // Step 4
  environment: "staging" | "production";
  selectedPlan: number;
  // Step 5
  tofuScript: string;
  tofuResources: string[];
  tofuAppName: string;
  tofuRegion: string;
  useDocker: boolean;
  buildMethod: "dockerfile" | "railpack" | "nixpacks" | "codebuild";
  envVars: Array<{ name: string; value: string }>;
  // Step 6
  deploymentId: string;
  deployStatus: string;
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
