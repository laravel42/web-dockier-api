import { useState, useEffect, useRef, useCallback } from "react";
import Editor from "react-simple-code-editor";
import { highlight, languages } from "prismjs";
import "prismjs/components/prism-properties";
import "prismjs/themes/prism.css";
import { deployApi, imageBuilderApi } from "../services/api";
import Modal from "./Modal";

// ─── Types ───

interface Provider {
  id: string;
  provider: string;
  label: string;
}

interface DetectedService {
  type: string;
  name: string;
  provider: string;
  confidence: number;
  configFile?: string;
}

interface AIAnalysis {
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

interface RepoAnalysis {
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

interface WizardState {
  // Step 1
  selectedProvider: string;
  selectedProviderId: string;
  // Step 2
  deployStrategy: "vps" | "managed" | "serverless";
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

interface DeployWizardProps {
  open: boolean;
  onClose: () => void;
  project: { id: string; name: string; repository: string; branch: string; connectionId: string };
  analysis: RepoAnalysis | null;
  analysisLoading?: boolean;
  analysisError?: string;
  providers: Provider[];
  onDeployComplete?: () => void;
}

// ─── Constants ───

const STEPS = [
  { label: "Provider", icon: "☁️" },
  { label: "Service", icon: "⚙️" },
  { label: "Analysis", icon: "🔍" },
  { label: "Plan", icon: "📋" },
  { label: "Config", icon: "🔧" },
  { label: "Deploy", icon: "🚀" },
];

const PROVIDER_META: Record<string, { name: string; icon: string; color: string; services: Array<{ type: "vps" | "managed" | "serverless"; label: string; name: string; description: string }> }> = {
  aws: {
    name: "AWS", icon: "amazonaws", color: "bg-orange-500",
    services: [
      { type: "managed", label: "Managed", name: "ECS Fargate", description: "Serverless containers — no servers to manage, auto-scaling included" },
      { type: "vps", label: "VPS", name: "EC2 Instance", description: "Full control over a virtual machine with Docker" },
      { type: "serverless", label: "Serverless", name: "App Runner", description: "Fully managed, auto-scaling web service from source or image" },
    ],
  },
  digitalocean: {
    name: "DigitalOcean", icon: "digitalocean", color: "bg-blue-600",
    services: [
      { type: "vps", label: "VPS", name: "Droplet", description: "Simple cloud VPS with Docker pre-installed" },
      { type: "managed", label: "Managed", name: "App Platform", description: "Managed PaaS — deploy from Git with zero config" },
    ],
  },
  hetzner: {
    name: "Hetzner", icon: "hetzner", color: "bg-red-600",
    services: [
      { type: "vps", label: "VPS", name: "Cloud Server", description: "High-performance VPS in Europe with excellent price/performance" },
    ],
  },
  vultr: {
    name: "Vultr", icon: "vultr", color: "bg-sky-600",
    services: [
      { type: "vps", label: "VPS", name: "Cloud Compute", description: "SSD cloud servers in 32 locations worldwide" },
    ],
  },
  linode: {
    name: "Linode (Akamai)", icon: "linode", color: "bg-green-600",
    services: [
      { type: "vps", label: "VPS", name: "Linode Instance", description: "Simple, predictable pricing with dedicated resources" },
    ],
  },
  upcloud: {
    name: "UpCloud", icon: "upcloud", color: "bg-violet-600",
    services: [
      { type: "vps", label: "VPS", name: "Cloud Server", description: "MaxIOPS storage for fast I/O performance" },
    ],
  },
  katapult: {
    name: "Katapult", icon: "katapult", color: "bg-pink-600",
    services: [
      { type: "vps", label: "VPS", name: "Virtual Machine", description: "Developer-friendly cloud with simple API" },
    ],
  },
  hostinger: {
    name: "Hostinger", icon: "hostinger", color: "bg-indigo-600",
    services: [
      { type: "vps", label: "VPS", name: "VPS Hosting", description: "Affordable VPS with global data centers" },
    ],
  },
};

const MANAGED_INFO: Record<string, Record<string, { service: string; cost: string }>> = {
  AWS: {
    database: { service: "Amazon RDS (Postgres/MySQL)", cost: "~$15/mo" },
    cache: { service: "Amazon ElastiCache (Redis)", cost: "~$15/mo" },
    queue: { service: "Amazon SQS", cost: "~$1/mo" },
    storage: { service: "Amazon S3", cost: "~$2/mo per 100GB" },
    search: { service: "Amazon OpenSearch", cost: "~$25/mo" },
    mail: { service: "Amazon SES", cost: "~$1/mo" },
  },
  DigitalOcean: {
    database: { service: "Managed Database", cost: "~$15/mo" },
    cache: { service: "Managed Redis", cost: "~$15/mo" },
    storage: { service: "Spaces (S3-compatible)", cost: "$5/mo" },
  },
  Hetzner: {
    database: { service: "Managed Database (Postgres)", cost: "~€15/mo" },
    storage: { service: "Object Storage (S3-compatible)", cost: "~€5/mo per TB" },
  },
  Vultr: {
    database: { service: "Managed Database", cost: "~$15/mo" },
    storage: { service: "Object Storage", cost: "$5/mo" },
  },
  Linode: {
    database: { service: "Managed Database", cost: "~$15/mo" },
    storage: { service: "Object Storage", cost: "$5/mo" },
  },
};

const FALLBACK_MANAGED: Record<string, { service: string; cost: string }> = {
  database: { service: "Managed Database", cost: "~$15/mo" },
  cache: { service: "Managed Redis", cost: "~$15/mo" },
  queue: { service: "Message Queue", cost: "~$10/mo" },
  storage: { service: "Object Storage", cost: "~$5/mo" },
  search: { service: "Search Service", cost: "~$25/mo" },
  mail: { service: "SMTP Provider", cost: "~$15/mo" },
  broadcasting: { service: "WebSocket Service", cost: "~$10/mo" },
  scheduler: { service: "Scheduler", cost: "~$5/mo" },
};

const PROVIDER_REGIONS: Record<string, Array<{ id: string; name: string; flag: string }>> = {
  aws: [
    { id: "us-east-1", name: "US East (N. Virginia)", flag: "🇺🇸" },
    { id: "us-east-2", name: "US East (Ohio)", flag: "🇺🇸" },
    { id: "us-west-1", name: "US West (N. California)", flag: "🇺🇸" },
    { id: "us-west-2", name: "US West (Oregon)", flag: "🇺🇸" },
    { id: "eu-west-1", name: "Europe (Ireland)", flag: "🇮🇪" },
    { id: "eu-west-2", name: "Europe (London)", flag: "🇬🇧" },
    { id: "eu-central-1", name: "Europe (Frankfurt)", flag: "🇩🇪" },
    { id: "ap-southeast-1", name: "Asia Pacific (Singapore)", flag: "🇸🇬" },
    { id: "ap-northeast-1", name: "Asia Pacific (Tokyo)", flag: "🇯🇵" },
    { id: "sa-east-1", name: "South America (São Paulo)", flag: "🇧🇷" },
  ],
  digitalocean: [
    { id: "nyc1", name: "New York 1", flag: "🇺🇸" },
    { id: "nyc3", name: "New York 3", flag: "🇺🇸" },
    { id: "sfo3", name: "San Francisco 3", flag: "🇺🇸" },
    { id: "ams3", name: "Amsterdam 3", flag: "🇳🇱" },
    { id: "lon1", name: "London 1", flag: "🇬🇧" },
    { id: "fra1", name: "Frankfurt 1", flag: "🇩🇪" },
    { id: "sgp1", name: "Singapore 1", flag: "🇸🇬" },
    { id: "blr1", name: "Bangalore 1", flag: "🇮🇳" },
    { id: "syd1", name: "Sydney 1", flag: "🇦🇺" },
  ],
  hetzner: [
    { id: "fsn1", name: "Falkenstein", flag: "🇩🇪" },
    { id: "nbg1", name: "Nuremberg", flag: "🇩🇪" },
    { id: "hel1", name: "Helsinki", flag: "🇫🇮" },
    { id: "ash", name: "Ashburn, VA", flag: "🇺🇸" },
    { id: "hil", name: "Hillsboro, OR", flag: "🇺🇸" },
  ],
  vultr: [
    { id: "ewr", name: "New Jersey", flag: "🇺🇸" },
    { id: "ord", name: "Chicago", flag: "🇺🇸" },
    { id: "dfw", name: "Dallas", flag: "🇺🇸" },
    { id: "lax", name: "Los Angeles", flag: "🇺🇸" },
    { id: "ams", name: "Amsterdam", flag: "🇳🇱" },
    { id: "lhr", name: "London", flag: "🇬🇧" },
    { id: "fra", name: "Frankfurt", flag: "🇩🇪" },
    { id: "nrt", name: "Tokyo", flag: "🇯🇵" },
    { id: "sgp", name: "Singapore", flag: "🇸🇬" },
    { id: "syd", name: "Sydney", flag: "🇦🇺" },
  ],
  linode: [
    { id: "us-east", name: "Newark, NJ", flag: "🇺🇸" },
    { id: "us-central", name: "Dallas, TX", flag: "🇺🇸" },
    { id: "us-west", name: "Fremont, CA", flag: "🇺🇸" },
    { id: "eu-west", name: "London", flag: "🇬🇧" },
    { id: "eu-central", name: "Frankfurt", flag: "🇩🇪" },
    { id: "ap-south", name: "Singapore", flag: "🇸🇬" },
    { id: "ap-northeast", name: "Tokyo", flag: "🇯🇵" },
    { id: "ap-southeast", name: "Sydney", flag: "🇦🇺" },
  ],
  upcloud: [
    { id: "de-fra1", name: "Frankfurt", flag: "🇩🇪" },
    { id: "fi-hel1", name: "Helsinki", flag: "🇫🇮" },
    { id: "nl-ams1", name: "Amsterdam", flag: "🇳🇱" },
    { id: "us-chi1", name: "Chicago", flag: "🇺🇸" },
    { id: "us-nyc1", name: "New York", flag: "🇺🇸" },
    { id: "sg-sin1", name: "Singapore", flag: "🇸🇬" },
  ],
};

const btnPrimary = "h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors";
const btnSecondary = "h-9 px-4 bg-secondary-50 text-text text-sm font-medium rounded-[var(--radius-btn)] hover:bg-secondary-100 transition-colors";

function parseOwnerRepo(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(repoUrl);
    const parts = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length >= 2) {
      const repo = parts[parts.length - 1];
      const owner = parts.slice(0, parts.length - 1).join("/");
      return { owner, repo };
    }
  } catch {}
  return null;
}

// ─── Stepper ───

function Stepper({ current, steps }: { current: number; steps: typeof STEPS }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center gap-1 flex-1">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold shrink-0 transition-colors ${
              done ? "bg-success-500 text-white" : active ? "bg-primary-500 text-white" : "bg-secondary-100 text-text-muted"
            }`}>
              {done ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${active ? "text-text" : "text-text-muted"}`}>{s.label}</span>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-1 ${done ? "bg-success-500" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}


// ─── Step 1: Provider Selection ───

function StepProvider({ state, providers, onChange }: {
  state: WizardState;
  providers: Provider[];
  onChange: (provider: string, providerId: string) => void;
}) {
  const configuredSlugs = new Set(providers.map(p => p.provider));
  const allProviders = Object.entries(PROVIDER_META);

  return (
    <div>
      <p className="text-sm text-text-secondary mb-3">Choose your cloud provider. Providers you've configured are highlighted.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {allProviders.map(([slug, meta]) => {
          const configured = configuredSlugs.has(slug);
          const selected = state.selectedProvider === slug;
          const matchingProvider = providers.find(p => p.provider === slug);
          return (
            <button
              key={slug}
              type="button"
              disabled={!configured}
              onClick={() => {
                if (matchingProvider) onChange(slug, matchingProvider.id);
              }}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                selected
                  ? "border-primary-500 bg-primary-50 shadow-sm"
                  : configured
                    ? "border-border bg-card hover:border-primary-300 hover:bg-secondary-50 cursor-pointer"
                    : "border-border/50 bg-secondary-50/50 opacity-50 cursor-not-allowed"
              }`}
            >
              <div className={`w-10 h-10 rounded-lg ${meta.color} flex items-center justify-center text-white text-xs font-bold`}>
                {meta.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs font-medium text-text">{meta.name}</span>
              {!configured && (
                <span className="text-[10px] text-text-muted">Not configured</span>
              )}
              {configured && matchingProvider && (
                <span className="text-[10px] text-primary-500 truncate max-w-full">{matchingProvider.label}</span>
              )}
              {selected && (
                <div className="absolute top-1.5 right-1.5">
                  <svg className="w-4 h-4 text-primary-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 2: Service Selection ───

function StepService({ state, onChange }: {
  state: WizardState;
  onChange: (strategy: "vps" | "managed" | "serverless") => void;
}) {
  const meta = PROVIDER_META[state.selectedProvider];
  if (!meta) return <p className="text-sm text-text-muted">Select a provider first.</p>;

  const typeIcons: Record<string, string> = {
    vps: "🖥️",
    managed: "☁️",
    serverless: "⚡",
  };

  return (
    <div>
      <p className="text-sm text-text-secondary mb-3">
        Choose how you want to deploy on {meta.name}. Each option has different trade-offs for control, cost, and complexity.
      </p>
      <div className="space-y-2">
        {meta.services.map((svc) => {
          const selected = state.deployStrategy === svc.type;
          return (
            <button
              key={svc.type}
              type="button"
              onClick={() => onChange(svc.type)}
              className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                selected
                  ? "border-primary-500 bg-primary-50"
                  : "border-border bg-card hover:border-primary-300"
              }`}
            >
              <span className="text-2xl mt-0.5">{typeIcons[svc.type] || "📦"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text">{svc.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                    svc.type === "managed" ? "bg-primary-50 text-primary-600" :
                    svc.type === "serverless" ? "bg-secondary-100 text-text-secondary" :
                    "bg-warning-50 text-warning-500"
                  }`}>{svc.label}</span>
                </div>
                <p className="text-xs text-text-muted mt-1">{svc.description}</p>
              </div>
              {selected && (
                <svg className="w-5 h-5 text-primary-500 shrink-0 mt-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 3: Code Analysis & Architecture ───

function StepAnalysis({ state, analysis, analysisLoading, analysisError, onChange }: {
  state: WizardState;
  analysis: RepoAnalysis | null;
  analysisLoading?: boolean;
  analysisError?: string;
  onChange: (modes: Record<string, "vps" | "managed">) => void;
}) {
  if (analysisLoading) {
    return (
      <div className="flex flex-col items-center py-8 gap-3">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-muted">Analyzing repository…</p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center py-8 gap-3 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-warning-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        {analysisError ? (
          <p className="text-sm text-danger-500">{analysisError}</p>
        ) : (
          <p className="text-sm text-text-muted">Could not analyze the repository.</p>
        )}
        <p className="text-xs text-text-muted">Click Next to continue — your app will be deployed as a standalone container.</p>
      </div>
    );
  }

  const providerName = PROVIDER_META[state.selectedProvider]?.name || state.selectedProvider;
  const getManagedInfo = (type: string) =>
    MANAGED_INFO[providerName]?.[type] || FALLBACK_MANAGED[type] || { service: "Managed Service", cost: "varies" };

  return (
    <div className="space-y-4">
      {/* AI Summary */}
      {analysis.aiAnalysis?.summary && (
        <div className="flex items-start gap-2 p-3 bg-primary-50 border border-primary-200 rounded-lg">
          <span className="text-base mt-0.5">✨</span>
          <div className="text-xs text-text-secondary">
            <span className="font-semibold">AI Analysis:</span> {analysis.aiAnalysis.summary}
            {analysis.aiAnalysis.runtime && (
              <span className="ml-1 text-text-muted">
                ({analysis.aiAnalysis.runtime} {analysis.aiAnalysis.runtimeVersion}
                {analysis.aiAnalysis.framework ? ` / ${analysis.aiAnalysis.framework} ${analysis.aiAnalysis.frameworkVersion}` : ""})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Tech Stack */}
      {analysis.techStack.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Detected Tech Stack</p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.techStack.map((t, i) => (
              <span key={i} className="px-2 py-0.5 bg-secondary-100 text-text-secondary rounded text-xs font-medium">
                {t.name}
                <span className="ml-1 text-text-muted">({t.category})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Detected Services */}
      {analysis.detectedServices.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            Infrastructure Components
          </p>
          <p className="text-xs text-text-muted mb-3">
            Choose between self-hosted (on the same server, no extra cost) or managed services (separate, provider-managed).
          </p>
          <div className="space-y-2">
            {analysis.detectedServices.map((svc) => {
              const managed = getManagedInfo(svc.type);
              const isManaged = state.servicesModes[svc.type] === "managed";
              return (
                <div key={svc.type} className="rounded-lg border border-border px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-text">{svc.name}</span>
                      <span className="text-xs text-text-muted">({svc.type})</span>
                      {svc.confidence >= 0.8 && (
                        <span className="px-1 py-0.5 bg-success-50 text-success-500 rounded text-[10px] font-medium">high confidence</span>
                      )}
                    </div>
                    <div className="flex rounded-md overflow-hidden border border-border shrink-0 ml-3">
                      <button
                        type="button"
                        onClick={() => onChange({ ...state.servicesModes, [svc.type]: "vps" })}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors ${!isManaged ? "bg-primary-500 text-white" : "bg-card text-text-secondary hover:bg-secondary-50"}`}
                      >
                        Self-hosted
                      </button>
                      <button
                        type="button"
                        onClick={() => onChange({ ...state.servicesModes, [svc.type]: "managed" })}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors ${isManaged ? "bg-primary-500 text-white" : "bg-card text-text-secondary hover:bg-secondary-50"}`}
                      >
                        Managed
                      </button>
                    </div>
                  </div>
                  {isManaged && (
                    <div className="mt-2 flex items-center gap-3 pl-0.5">
                      <span className="text-xs text-primary-600 font-medium">{managed.service}</span>
                      <span className="text-xs text-text-muted">·</span>
                      <span className="text-xs font-semibold text-warning-500">{managed.cost}</span>
                    </div>
                  )}
                  {!isManaged && (
                    <div className="mt-1.5 pl-0.5">
                      <span className="text-xs text-text-muted">Installed on the same instance — no extra cost</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {analysis.detectedServices.length === 0 && (
        <div className="rounded-lg bg-secondary-50 p-4 text-center">
          <p className="text-sm text-text-muted">No additional services detected. Your app will be deployed as a standalone container.</p>
        </div>
      )}
    </div>
  );
}


// ─── Step 4: Environment & Deployment Plans ───

interface Plan {
  tier: "value" | "balanced" | "performance";
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

function getPlans(
  provider: string,
  environment: "staging" | "production",
  servicesModes: Record<string, "vps" | "managed">,
  deployStrategy: "vps" | "managed" | "serverless"
): Plan[] {
  const managedSvcs = Object.entries(servicesModes).filter(([, m]) => m === "managed").map(([t]) => t);
  const isProd = environment === "production";

  const awsEc2Plans: Plan[] = [
    {
      tier: "value", label: "Starter", badge: "Best Value", badgeColor: "bg-success-50 text-success-500",
      instance: isProd ? "t3.small" : "t3.micro", cpu: isProd ? "2 vCPU" : "2 vCPU (burstable)", ram: isProd ? "2 GB" : "1 GB",
      storage: "20 GB gp3", network: "Up to 5 Gbps",
      managedServices: managedSvcs.map(s => MANAGED_INFO.AWS?.[s]?.service || s),
      monthlyPrice: isProd ? "~$20/mo" : "~$10/mo",
      breakdown: [{ item: "EC2 Instance", cost: isProd ? "$15" : "$8" }, { item: "EBS", cost: "$2" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.AWS?.[s]?.service || s, cost: MANAGED_INFO.AWS?.[s]?.cost || "~$5" }))],
    },
    {
      tier: "balanced", label: "Standard", badge: "Best Balance", badgeColor: "bg-primary-50 text-primary-600",
      instance: isProd ? "t3.medium" : "t3.small", cpu: isProd ? "2 vCPU" : "2 vCPU", ram: isProd ? "4 GB" : "2 GB",
      storage: "30 GB gp3", network: "Up to 5 Gbps",
      managedServices: managedSvcs.map(s => MANAGED_INFO.AWS?.[s]?.service || s),
      monthlyPrice: isProd ? "~$40/mo" : "~$20/mo",
      breakdown: [{ item: "EC2 Instance", cost: isProd ? "$30" : "$15" }, { item: "EBS", cost: "$3" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.AWS?.[s]?.service || s, cost: MANAGED_INFO.AWS?.[s]?.cost || "~$10" }))],
    },
    {
      tier: "performance", label: "Performance", badge: "Top Performance", badgeColor: "bg-secondary-100 text-text-secondary",
      instance: isProd ? "m6i.large" : "t3.medium", cpu: isProd ? "2 vCPU (dedicated)" : "2 vCPU", ram: isProd ? "8 GB" : "4 GB",
      storage: "50 GB gp3", network: "Up to 10 Gbps",
      managedServices: managedSvcs.map(s => MANAGED_INFO.AWS?.[s]?.service || s),
      monthlyPrice: isProd ? "~$80/mo" : "~$40/mo",
      breakdown: [{ item: "EC2 Instance", cost: isProd ? "$60" : "$30" }, { item: "EBS", cost: "$5" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.AWS?.[s]?.service || s, cost: MANAGED_INFO.AWS?.[s]?.cost || "~$15" }))],
    },
  ];

  const awsEcsPlans: Plan[] = [
    {
      tier: "value", label: "Starter", badge: "Best Value", badgeColor: "bg-success-50 text-success-500",
      instance: isProd ? "0.5 vCPU / 2 GB" : "0.25 vCPU / 1 GB", cpu: isProd ? "0.5 vCPU" : "0.25 vCPU", ram: isProd ? "2 GB" : "1 GB",
      storage: "20 GB (ephemeral)", network: "Up to 5 Gbps",
      managedServices: managedSvcs.map(s => MANAGED_INFO.AWS?.[s]?.service || s),
      monthlyPrice: isProd ? "~$25/mo" : "~$10/mo",
      breakdown: [{ item: "ECS Fargate", cost: isProd ? "$18" : "$5" }, { item: "ECR", cost: "$1" }, { item: "CloudWatch", cost: "$1" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.AWS?.[s]?.service || s, cost: MANAGED_INFO.AWS?.[s]?.cost || "~$5" }))],
    },
    {
      tier: "balanced", label: "Standard", badge: "Best Balance", badgeColor: "bg-primary-50 text-primary-600",
      instance: isProd ? "1 vCPU / 4 GB" : "0.5 vCPU / 2 GB", cpu: isProd ? "1 vCPU" : "0.5 vCPU", ram: isProd ? "4 GB" : "2 GB",
      storage: "30 GB (ephemeral)", network: "Up to 5 Gbps",
      managedServices: managedSvcs.map(s => MANAGED_INFO.AWS?.[s]?.service || s),
      monthlyPrice: isProd ? "~$50/mo" : "~$25/mo",
      breakdown: [{ item: "ECS Fargate", cost: isProd ? "$35" : "$18" }, { item: "ECR", cost: "$1" }, { item: "CloudWatch", cost: "$2" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.AWS?.[s]?.service || s, cost: MANAGED_INFO.AWS?.[s]?.cost || "~$10" }))],
    },
    {
      tier: "performance", label: "Performance", badge: "Top Performance", badgeColor: "bg-secondary-100 text-text-secondary",
      instance: isProd ? "2 vCPU / 8 GB" : "1 vCPU / 4 GB", cpu: isProd ? "2 vCPU" : "1 vCPU", ram: isProd ? "8 GB" : "4 GB",
      storage: "50 GB (ephemeral)", network: "Up to 10 Gbps",
      managedServices: managedSvcs.map(s => MANAGED_INFO.AWS?.[s]?.service || s),
      monthlyPrice: isProd ? "~$100/mo" : "~$50/mo",
      breakdown: [{ item: "ECS Fargate", cost: isProd ? "$70" : "$35" }, { item: "ECR", cost: "$1" }, { item: "CloudWatch", cost: "$3" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.AWS?.[s]?.service || s, cost: MANAGED_INFO.AWS?.[s]?.cost || "~$15" }))],
    },
  ];

  const awsAppRunnerPlans: Plan[] = [
    {
      tier: "value", label: "Starter", badge: "Best Value", badgeColor: "bg-success-50 text-success-500",
      instance: "0.25 vCPU / 0.5 GB", cpu: "0.25 vCPU", ram: "0.5 GB",
      storage: "Included", network: "Included",
      managedServices: managedSvcs.map(s => MANAGED_INFO.AWS?.[s]?.service || s),
      monthlyPrice: isProd ? "~$25/mo" : "~$10/mo",
      breakdown: [{ item: "App Runner", cost: isProd ? "$20" : "$8" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.AWS?.[s]?.service || s, cost: MANAGED_INFO.AWS?.[s]?.cost || "~$5" }))],
    },
    {
      tier: "balanced", label: "Standard", badge: "Best Balance", badgeColor: "bg-primary-50 text-primary-600",
      instance: "0.5 vCPU / 1 GB", cpu: "0.5 vCPU", ram: "1 GB",
      storage: "Included", network: "Included",
      managedServices: managedSvcs.map(s => MANAGED_INFO.AWS?.[s]?.service || s),
      monthlyPrice: isProd ? "~$50/mo" : "~$25/mo",
      breakdown: [{ item: "App Runner", cost: isProd ? "$45" : "$22" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.AWS?.[s]?.service || s, cost: MANAGED_INFO.AWS?.[s]?.cost || "~$10" }))],
    },
    {
      tier: "performance", label: "Performance", badge: "Top Performance", badgeColor: "bg-secondary-100 text-text-secondary",
      instance: "1 vCPU / 2 GB", cpu: "1 vCPU", ram: "2 GB",
      storage: "Included", network: "Included",
      managedServices: managedSvcs.map(s => MANAGED_INFO.AWS?.[s]?.service || s),
      monthlyPrice: isProd ? "~$100/mo" : "~$50/mo",
      breakdown: [{ item: "App Runner", cost: isProd ? "$90" : "$45" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.AWS?.[s]?.service || s, cost: MANAGED_INFO.AWS?.[s]?.cost || "~$15" }))],
    },
  ];

  const plans: Record<string, Plan[]> = {
    aws: deployStrategy === "vps" ? awsEc2Plans : deployStrategy === "serverless" ? awsAppRunnerPlans : awsEcsPlans,
    digitalocean: [
      {
        tier: "value", label: "Basic Droplet", badge: "Best Value", badgeColor: "bg-success-50 text-success-500",
        instance: isProd ? "s-1vcpu-2gb" : "s-1vcpu-1gb", cpu: "1 vCPU", ram: isProd ? "2 GB" : "1 GB",
        storage: "50 GB SSD", network: "1 TB transfer",
        managedServices: managedSvcs.map(s => MANAGED_INFO.DigitalOcean?.[s]?.service || s),
        monthlyPrice: isProd ? "$12/mo" : "$6/mo",
        breakdown: [{ item: "Droplet", cost: isProd ? "$12" : "$6" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.DigitalOcean?.[s]?.service || s, cost: MANAGED_INFO.DigitalOcean?.[s]?.cost || "~$10" }))],
      },
      {
        tier: "balanced", label: "General Purpose", badge: "Best Balance", badgeColor: "bg-primary-50 text-primary-600",
        instance: isProd ? "g-2vcpu-8gb" : "s-2vcpu-4gb", cpu: "2 vCPU", ram: isProd ? "8 GB" : "4 GB",
        storage: isProd ? "25 GB NVMe" : "80 GB SSD", network: isProd ? "4 TB transfer" : "4 TB transfer",
        managedServices: managedSvcs.map(s => MANAGED_INFO.DigitalOcean?.[s]?.service || s),
        monthlyPrice: isProd ? "$63/mo" : "$24/mo",
        breakdown: [{ item: "Droplet", cost: isProd ? "$63" : "$24" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.DigitalOcean?.[s]?.service || s, cost: MANAGED_INFO.DigitalOcean?.[s]?.cost || "~$15" }))],
      },
      {
        tier: "performance", label: "CPU-Optimized", badge: "Top Performance", badgeColor: "bg-secondary-100 text-text-secondary",
        instance: isProd ? "c-4vcpu-8gb" : "c-2vcpu-4gb", cpu: isProd ? "4 vCPU (dedicated)" : "2 vCPU (dedicated)", ram: isProd ? "8 GB" : "4 GB",
        storage: isProd ? "50 GB NVMe" : "25 GB NVMe", network: "5 TB transfer",
        managedServices: managedSvcs.map(s => MANAGED_INFO.DigitalOcean?.[s]?.service || s),
        monthlyPrice: isProd ? "$84/mo" : "$42/mo",
        breakdown: [{ item: "Droplet", cost: isProd ? "$84" : "$42" }, ...managedSvcs.map(s => ({ item: MANAGED_INFO.DigitalOcean?.[s]?.service || s, cost: MANAGED_INFO.DigitalOcean?.[s]?.cost || "~$15" }))],
      },
    ],
  };

  // Generic fallback for providers without specific plans
  const fallback: Plan[] = [
    {
      tier: "value", label: "Starter", badge: "Best Value", badgeColor: "bg-success-50 text-success-500",
      instance: isProd ? "2 vCPU / 2 GB" : "1 vCPU / 1 GB", cpu: isProd ? "2 vCPU" : "1 vCPU", ram: isProd ? "2 GB" : "1 GB",
      storage: "40 GB SSD", network: "2 TB transfer",
      managedServices: managedSvcs.map(s => FALLBACK_MANAGED[s]?.service || s),
      monthlyPrice: isProd ? "~$10/mo" : "~$5/mo",
      breakdown: [{ item: "VPS", cost: isProd ? "$10" : "$5" }, ...managedSvcs.map(s => ({ item: FALLBACK_MANAGED[s]?.service || s, cost: FALLBACK_MANAGED[s]?.cost || "~$10" }))],
    },
    {
      tier: "balanced", label: "Standard", badge: "Best Balance", badgeColor: "bg-primary-50 text-primary-600",
      instance: isProd ? "2 vCPU / 4 GB" : "2 vCPU / 2 GB", cpu: "2 vCPU", ram: isProd ? "4 GB" : "2 GB",
      storage: "80 GB SSD", network: "4 TB transfer",
      managedServices: managedSvcs.map(s => FALLBACK_MANAGED[s]?.service || s),
      monthlyPrice: isProd ? "~$20/mo" : "~$10/mo",
      breakdown: [{ item: "VPS", cost: isProd ? "$20" : "$10" }, ...managedSvcs.map(s => ({ item: FALLBACK_MANAGED[s]?.service || s, cost: FALLBACK_MANAGED[s]?.cost || "~$15" }))],
    },
    {
      tier: "performance", label: "Performance", badge: "Top Performance", badgeColor: "bg-secondary-100 text-text-secondary",
      instance: isProd ? "4 vCPU / 8 GB" : "2 vCPU / 4 GB", cpu: isProd ? "4 vCPU" : "2 vCPU", ram: isProd ? "8 GB" : "4 GB",
      storage: "160 GB SSD", network: "8 TB transfer",
      managedServices: managedSvcs.map(s => FALLBACK_MANAGED[s]?.service || s),
      monthlyPrice: isProd ? "~$40/mo" : "~$20/mo",
      breakdown: [{ item: "VPS", cost: isProd ? "$40" : "$20" }, ...managedSvcs.map(s => ({ item: FALLBACK_MANAGED[s]?.service || s, cost: FALLBACK_MANAGED[s]?.cost || "~$15" }))],
    },
  ];

  return plans[provider] || fallback;
}

function StepEnvironment({ state, onChange, onRegionChange }: {
  state: WizardState;
  onChange: (env: "staging" | "production", plan: number) => void;
  onRegionChange: (region: string) => void;
}) {
  const plans = getPlans(state.selectedProvider, state.environment, state.servicesModes, state.deployStrategy);
  const regions = PROVIDER_REGIONS[state.selectedProvider] || [];

  return (
    <div className="space-y-4">
      {/* Environment toggle */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Environment</p>
        <div className="flex rounded-lg overflow-hidden border border-border w-fit">
          {(["staging", "production"] as const).map((env) => (
            <button
              key={env}
              type="button"
              onClick={() => onChange(env, state.selectedPlan)}
              className={`px-4 py-2 text-sm font-medium transition-colors capitalize ${
                state.environment === env ? "bg-primary-500 text-white" : "bg-card text-text-secondary hover:bg-secondary-50"
              }`}
            >
              {env === "staging" ? "🧪 Staging" : "🚀 Production"}
            </button>
          ))}
        </div>
      </div>

      {/* Region selector */}
      {regions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Region</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto scrollbar-hide">
            {regions.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onRegionChange(r.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-all ${
                  state.tofuRegion === r.id
                    ? "border-primary-500 bg-primary-50 text-text"
                    : "border-border bg-card text-text-secondary hover:border-primary-300"
                }`}
              >
                <span>{r.flag}</span>
                <div className="min-w-0">
                  <span className="font-medium block truncate">{r.name}</span>
                  <span className="text-text-muted text-[10px]">{r.id}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plans */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Deployment Plans</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {plans.map((plan, i) => {
            const selected = state.selectedPlan === i;
            return (
              <button
                key={plan.tier}
                type="button"
                onClick={() => onChange(state.environment, i)}
                className={`flex flex-col p-4 rounded-xl border-2 text-left transition-all ${
                  selected ? "border-primary-500 bg-primary-50 shadow-sm" : "border-border bg-card hover:border-primary-300"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${plan.badgeColor}`}>{plan.badge}</span>
                  {selected && (
                    <svg className="w-4 h-4 text-primary-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                  )}
                </div>
                <p className="text-sm font-semibold text-text mb-2">{plan.label}</p>
                <div className="space-y-1 text-xs text-text-secondary flex-1">
                  <div className="flex justify-between"><span>CPU</span><span className="font-medium text-text">{plan.cpu}</span></div>
                  <div className="flex justify-between"><span>RAM</span><span className="font-medium text-text">{plan.ram}</span></div>
                  <div className="flex justify-between"><span>Storage</span><span className="font-medium text-text">{plan.storage}</span></div>
                  <div className="flex justify-between"><span>Network</span><span className="font-medium text-text">{plan.network}</span></div>
                </div>
                {plan.managedServices.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-[10px] text-text-muted uppercase mb-1">Managed Services</p>
                    {plan.managedServices.map((s, j) => (
                      <p key={j} className="text-xs text-primary-600">{s}</p>
                    ))}
                  </div>
                )}
                <div className="mt-3 pt-2 border-t border-border">
                  <p className="text-lg font-bold text-primary-500">{plan.monthlyPrice}</p>
                  <p className="text-[10px] text-text-muted">estimated monthly</p>
                </div>
                {/* Breakdown tooltip */}
                <div className="mt-2 space-y-0.5">
                  {plan.breakdown.map((b, j) => (
                    <div key={j} className="flex justify-between text-[10px] text-text-muted">
                      <span>{b.item}</span><span>{b.cost}</span>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ─── Step 5: Pulumi Program Review ───

function parseEnvContent(text: string): Array<{ name: string; value: string }> {
  const rows: Array<{ name: string; value: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
    if (name) rows.push({ name, value });
  }
  return rows;
}

function formatEnvContent(rows: Array<{ name: string; value: string }>): string {
  return rows.map(({ name, value }) => {
    const needsQuotes = /[\s#"'$]/.test(value) || value.includes("=");
    return needsQuotes ? `${name}="${value.replace(/"/g, '\\"').replace(/\n/g, "\\n")}"` : `${name}=${value}`;
  }).join("\n");
}

function StepCompose({ state, loading, error, onToggleDocker, onBuildMethodChange, onEnvChange }: {
  state: WizardState;
  loading: boolean;
  error: string;
  onToggleDocker: () => void;
  onBuildMethodChange: (method: "dockerfile" | "railpack" | "nixpacks" | "codebuild") => void;
  onEnvChange: (envVars: Array<{ name: string; value: string }>) => void;
}) {
  const [rawEnv, setRawEnv] = useState(() => formatEnvContent(state.envVars));
  const isInternalEditRef = useRef(false);

  useEffect(() => {
    if (isInternalEditRef.current) {
      isInternalEditRef.current = false;
      return;
    }
    const formatted = formatEnvContent(state.envVars);
    setRawEnv((prev) => {
      const parsed = parseEnvContent(prev);
      const same = state.envVars.length === parsed.length &&
        state.envVars.every((r, i) => r.name === parsed[i]?.name && r.value === parsed[i]?.value);
      return same ? prev : formatted;
    });
  }, [state.envVars]);

  const handleEnvEdit = (text: string) => {
    isInternalEditRef.current = true;
    setRawEnv(text);
    onEnvChange(parseEnvContent(text));
  };

  return (
    <div className="space-y-4">
      {/* Docker toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor"><path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.186.186 0 00-.185.186v1.887c0 .102.083.185.185.185zm-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.186.186 0 00-.185.185v1.888c0 .102.082.186.185.186zm0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.186.186 0 00-.185.185v1.887c0 .102.082.186.185.186zm-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186zm-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.186.186.186zm5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.186.186 0 00-.185.186v1.887c0 .102.082.185.185.185zm-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.186v1.887c0 .102.083.185.185.185zm-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186H5.136a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185zm-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185zM23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288z"/></svg>
          <div>
            <span className="text-sm font-medium text-text">Docker Build</span>
            <p className="text-xs text-text-muted">Build and deploy as a container image</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleDocker}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${state.useDocker ? "bg-primary-500" : "bg-border"}`}
          role="switch"
          aria-checked={state.useDocker}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${state.useDocker ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      {/* Build method selector */}
      {state.useDocker && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Build Method</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => onBuildMethodChange("dockerfile")}
              className={`p-3 rounded-lg border text-left transition-all ${
                state.buildMethod === "dockerfile"
                  ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500/30"
                  : "border-border bg-surface hover:border-primary-500/30"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor"><path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.186.186 0 00-.185.186v1.887c0 .102.083.185.185.185zm-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.186.186 0 00-.185.185v1.888c0 .102.082.186.185.186zm0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.186.186 0 00-.185.185v1.887c0 .102.082.186.185.186z"/></svg>
                <span className="text-sm font-medium text-text">Dockerfile</span>
              </div>
              <p className="text-xs text-text-muted">Auto-generated Dockerfile with auto-fix on failure</p>
            </button>
            <button
              type="button"
              onClick={() => onBuildMethodChange("railpack")}
              className={`p-3 rounded-lg border text-left transition-all ${
                state.buildMethod === "railpack"
                  ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500/30"
                  : "border-border bg-surface hover:border-primary-500/30"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                <span className="text-sm font-medium text-text">Railpack</span>
              </div>
              <p className="text-xs text-text-muted">Zero-config builder by Railway, falls back to Dockerfile</p>
            </button>
            <button
              type="button"
              onClick={() => onBuildMethodChange("nixpacks")}
              className={`p-3 rounded-lg border text-left transition-all ${
                state.buildMethod === "nixpacks"
                  ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500/30"
                  : "border-border bg-surface hover:border-primary-500/30"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-cyan-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                <span className="text-sm font-medium text-text">Nixpacks</span>
              </div>
              <p className="text-xs text-text-muted">Nix-based builder by Railway, falls back to Dockerfile</p>
            </button>
            <button
              type="button"
              onClick={() => onBuildMethodChange("codebuild")}
              className={`p-3 rounded-lg border text-left transition-all ${
                state.buildMethod === "codebuild"
                  ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500/30"
                  : "border-border bg-surface hover:border-primary-500/30"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-orange-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" /></svg>
                <span className="text-sm font-medium text-text">CodeBuild</span>
              </div>
              <p className="text-xs text-text-muted">AWS CodeBuild with BuildKit + ECR cache, no local Docker needed</p>
            </button>
          </div>
        </div>
      )}

      {/* Resources */}
      {state.tofuResources.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">Resources to create</p>
          <div className="flex flex-wrap gap-1.5">
            {state.tofuResources.map((r, i) => (
              <span key={i} className="px-2 py-0.5 bg-primary-50 text-primary-600 rounded text-xs font-medium">{r}</span>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 py-6 justify-center">
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-text-muted">Preparing deployment…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">{error}</div>
      )}

      {/* Environment Variables */}
      {!loading && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Environment Variables</p>
          <div className="rounded-lg border border-border overflow-hidden focus-within:ring-1 focus-within:ring-primary-500/40 focus-within:border-primary-500/40 bg-card">
            <Editor
              value={rawEnv}
              onValueChange={handleEnvEdit}
              highlight={(code) => highlight(code, languages.properties, "properties")}
              padding={12}
              placeholder="# Paste your .env file content
KEY=value
ANOTHER=value
# Comments are ignored"
              textareaClassName="!outline-none"
              preClassName="!m-0 !bg-transparent"
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 14,
                minHeight: 140,
              }}
            />
          </div>
          <p className="text-[10px] text-text-muted mt-2">Paste your .env file content. Each line should be KEY=value. Comments (#) and empty lines are ignored.</p>
        </div>
      )}
    </div>
  );
}

// ─── Step 6: Deploy & Logs ───

function StepDeploy({ state }: { state: WizardState }) {
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [state.deployLogs]);

  const statusColors: Record<string, string> = {
    pending: "bg-warning-50 text-warning-500",
    building: "bg-primary-50 text-primary-500",
    deploying: "bg-primary-100 text-primary-700",
    success: "bg-success-50 text-success-500",
    failed: "bg-danger-50 text-danger-500",
  };

  const isRunning = ["pending", "building", "deploying"].includes(state.deployStatus);

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-text-muted uppercase tracking-wide">Status:</span>
        <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${statusColors[state.deployStatus] || "bg-secondary-100 text-text-muted"}`}>
          {state.deployStatus || "waiting"}
        </span>
        {isRunning && <div className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />}
      </div>

      {/* Timeline steps */}
      <div className="flex items-center gap-2 text-xs">
        {["Provisioning", "Building Image", "Pushing", "Starting"].map((step, i) => {
          const phases = ["pending", "building", "deploying", "success"];
          const currentIdx = phases.indexOf(state.deployStatus);
          const done = currentIdx > i;
          const active = currentIdx === i;
          return (
            <div key={step} className="flex items-center gap-1.5 flex-1">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                done ? "bg-success-500 text-white" : active ? "bg-primary-500 text-white" : "bg-secondary-100 text-text-muted"
              }`}>
                {done ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : active ? (
                  <div className="w-2 h-2 border border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-[9px]">{i + 1}</span>
                )}
              </div>
              <span className={`hidden sm:block ${active ? "text-text font-medium" : "text-text-muted"}`}>{step}</span>
              {i < 3 && <div className={`flex-1 h-px ${done ? "bg-success-500" : "bg-border"}`} />}
            </div>
          );
        })}
      </div>

      {/* Logs */}
      {state.deployLogs.length > 0 && (
        <div ref={logsRef} className="rounded-lg bg-gray-900 p-3 max-h-72 overflow-y-auto scrollbar-hide font-mono text-xs leading-relaxed">
          {state.deployLogs.map((line, i) => (
            <div key={i} className={
              line.includes("✓") ? "text-green-400" :
              line.includes("✗") ? "text-red-400" :
              line.includes("──") ? "text-cyan-400" :
              line.includes("ℹ") ? "text-blue-300" :
              line.includes("▶") ? "text-yellow-300" :
              line.includes("⚠") ? "text-amber-400" :
              "text-gray-300"
            }>
              {line}
            </div>
          ))}
        </div>
      )}

      {state.deployLogs.length === 0 && isRunning && (
        <div className="rounded-lg bg-gray-900 p-6 flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-400">Waiting for logs…</span>
        </div>
      )}

      {/* CodeBuild logs link */}
      {state.codebuildLogsUrl && (
        <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3">
          <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide mb-1">CodeBuild Logs</p>
          <a href={state.codebuildLogsUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-500 hover:text-primary-700 transition-colors break-all flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            View in CloudWatch
          </a>
        </div>
      )}

      {/* CodeBuild image URI */}
      {state.codebuildImageUri && (
        <div className="rounded-lg bg-primary-500/10 border border-primary-500/20 p-3">
          <p className="text-xs text-primary-600 font-semibold uppercase tracking-wide mb-1">Built Image</p>
          <p className="text-sm text-text font-mono break-all">{state.codebuildImageUri}</p>
        </div>
      )}

      {/* App URL */}
      {state.deployAppUrl && (
        <div className="rounded-lg bg-success-500/10 border border-success-500/20 p-3">
          <p className="text-xs text-success-500 font-semibold uppercase tracking-wide mb-1">Application URL</p>
          <a href={state.deployAppUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-500 hover:text-primary-700 transition-colors break-all flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            {state.deployAppUrl}
          </a>
        </div>
      )}
    </div>
  );
}


// ─── Main Wizard Container ───

export default function DeployWizard({ open, onClose, project, analysis, analysisLoading, analysisError, providers, onDeployComplete }: DeployWizardProps) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    selectedProvider: "",
    selectedProviderId: "",
    deployStrategy: "vps",
    servicesModes: {},
    environment: "production",
    selectedPlan: 1,
    tofuScript: "",
    tofuResources: [],
    tofuAppName: "",
    tofuRegion: "",
    useDocker: true,
    buildMethod: "dockerfile",
    envVars: [],
    deploymentId: "",
    deployStatus: "",
    deployLogs: [],
    deployAppUrl: "",
    codebuildBuildId: "",
    codebuildImageUri: "",
    codebuildLogsUrl: "",
  });
  const [tofuLoading, setTofuLoading] = useState(false);
  const [tofuError, setTofuError] = useState("");
  const [deployError, setDeployError] = useState("");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setStep(0);
      setState({
        selectedProvider: "",
        selectedProviderId: "",
        deployStrategy: "vps",
        servicesModes: {},
        environment: "production",
        selectedPlan: 1,
        tofuScript: "",
        tofuResources: [],
        tofuAppName: "",
        tofuRegion: "",
        useDocker: true,
        buildMethod: "dockerfile",
        envVars: [],
        deploymentId: "",
        deployStatus: "",
        deployLogs: [],
        deployAppUrl: "",
        codebuildBuildId: "",
        codebuildImageUri: "",
        codebuildLogsUrl: "",
      });
      setTofuLoading(false);
      setTofuError("");
      setDeployError("");
    }
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [open]);

  // Sync service modes when analysis arrives (without resetting wizard)
  useEffect(() => {
    if (open && analysis?.detectedServices?.length) {
      setState(prev => {
        if (Object.keys(prev.servicesModes).length > 0) return prev;
        const modes: Record<string, "vps" | "managed"> = {};
        analysis.detectedServices.forEach((s) => { modes[s.type] = "vps"; });
        // Pre-populate env vars from AI analysis
        const envVars = prev.envVars.length > 0 ? prev.envVars
          : (analysis.aiAnalysis?.envVars || []).map(entry => {
              const eqIdx = entry.indexOf("=");
              return eqIdx >= 0
                ? { name: entry.slice(0, eqIdx), value: entry.slice(eqIdx + 1) }
                : { name: entry, value: "" };
            });
        return { ...prev, servicesModes: modes, envVars };
      });
    }
  }, [open, analysis]);

  // Generate Pulumi program
  const generateScript = useCallback(async (overrideState?: Partial<WizardState>) => {
    const s = { ...state, ...overrideState };
    if (!s.selectedProviderId || !project) return;
    setTofuLoading(true);
    setTofuError("");
    try {
      const parsed = parseOwnerRepo(project.repository);
      const repo = parsed ? `${parsed.owner}/${parsed.repo}` : project.repository;
      const plans = getPlans(s.selectedProvider, s.environment, s.servicesModes, s.deployStrategy);
      const selectedPlan = plans[s.selectedPlan] || plans[1] || plans[0];
      const res = await deployApi.generateTofu({
        providerId: s.selectedProviderId,
        repo,
        branch: project.branch || "main",
        techStack: analysis?.techStack.map(t => t.name) || [],
        primaryLanguage: analysis?.primaryLanguage || "",
        hasDocker: analysis?.hasDocker || false,
        appName: s.tofuAppName || undefined,
        region: s.tofuRegion || undefined,
        deployStrategy: s.deployStrategy || undefined,
        useDocker: s.useDocker || undefined,
        instanceType: selectedPlan?.instance || undefined,
        services: analysis?.detectedServices?.length
          ? analysis.detectedServices.map(svc => ({ type: svc.type, name: svc.name, mode: s.servicesModes[svc.type] || "vps" }))
          : undefined,
        aiAnalysis: analysis?.aiAnalysis || undefined,
      });
      setState(prev => ({
        ...prev,
        ...overrideState,
        tofuScript: res.script,
        tofuResources: res.estimatedResources,
        tofuAppName: res.appName,
        tofuRegion: res.region,
      }));
    } catch (err: any) {
      setTofuError(err.message || "Failed to generate Pulumi program");
    } finally {
      setTofuLoading(false);
    }
  }, [state, project, analysis]);

  // Start deployment
  const startDeploy = useCallback(async () => {
    if (!project || !state.selectedProviderId) return;
    setDeployError("");
    setState(prev => ({ ...prev, deployStatus: "pending", deployLogs: [], deployAppUrl: "", codebuildBuildId: "", codebuildImageUri: "", codebuildLogsUrl: "" }));
    try {
      const parsed = parseOwnerRepo(project.repository);
      const repo = parsed ? `${parsed.owner}/${parsed.repo}` : project.repository;

      // ── CodeBuild path: build image first via image-builder, then deploy ──
      if (state.buildMethod === "codebuild") {
        const ts0 = new Date().toISOString().replace("T", " ").slice(0, 19);
        const deployTargetMap: Record<string, "ecs" | "apprunner" | "ec2"> = {
          vps: "ec2",
          managed: "ecs",
          serverless: "apprunner",
        };
        const deployTarget = deployTargetMap[state.deployStrategy] || "ec2";

        const formattedLogs: string[] = [
          `[${ts0}] ▶ Starting deployment pipeline...`,
          `[${ts0}] ℹ Provider: ${state.selectedProvider} | Region: ${state.tofuRegion || "us-east-1"}`,
          `[${ts0}] ℹ Strategy: ${state.deployStrategy}`,
          `[${ts0}] ℹ Repository: ${repo} | Branch: ${project.branch || "main"}`,
          `[${ts0}]`,
        ];

        // Add analysis details to match deploy service log format
        if (analysis) {
          formattedLogs.push(`[${ts0}] ── Analyze Repository ──────────────`);
          if (analysis.primaryLanguage) formattedLogs.push(`[${ts0}] ℹ Runtime: ${analysis.primaryLanguage}${analysis.aiAnalysis?.runtimeVersion ? " " + analysis.aiAnalysis.runtimeVersion : ""}`);
          if (analysis.aiAnalysis?.framework) formattedLogs.push(`[${ts0}] ℹ Framework: ${analysis.aiAnalysis.framework}${analysis.aiAnalysis.frameworkVersion ? " " + analysis.aiAnalysis.frameworkVersion : ""}`);
          if (analysis.techStack?.length) formattedLogs.push(`[${ts0}] ℹ Tech stack: ${analysis.techStack.map((t: any) => t.name || t).join(", ")}`);
          if (analysis.aiAnalysis?.port) formattedLogs.push(`[${ts0}] ℹ Port: ${analysis.aiAnalysis.port}`);
          formattedLogs.push(`[${ts0}] ℹ Deploy target: ${deployTarget}`);
          formattedLogs.push(`[${ts0}]`);
        }

        setState(prev => ({ ...prev, deployStatus: "building", deployLogs: formattedLogs }));

        const plans = getPlans(state.selectedProvider, state.environment, state.servicesModes, state.deployStrategy);
        const plan = plans[state.selectedPlan] || plans[1] || plans[0];

        const build = await imageBuilderApi.startBuild({
          sourceRepo: repo,
          sourceRef: project.branch || "main",
          projectId: project.id,
          gitConnectionId: project.connectionId,
          deployTarget,
          deployParams: {
            appName: state.tofuAppName || project.name?.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || undefined,
            containerPort: analysis?.aiAnalysis?.port || 3000,
            instanceType: plan?.instance || undefined,
            cpu: plan?.cpu?.match(/[\d.]+/)?.[0] ? String(Math.round(parseFloat(plan.cpu.match(/[\d.]+/)![0]) * 1024)) : undefined,
            memory: plan?.ram?.match(/[\d.]+/)?.[0] ? String(Math.round(parseFloat(plan.ram.match(/[\d.]+/)![0]) * 1024)) : undefined,
            envVars: state.envVars.length > 0 ? state.envVars : undefined,
          },
        });

        // Create a deployment record so it appears in deploy history
        let codebuildDeployId = "";
        try {
          const dep = await deployApi.createDeployment({
            providerId: state.selectedProviderId,
            gitConnectionId: project.connectionId,
            repo,
            branch: project.branch || "main",
            techStack: analysis?.techStack.map(t => t.name) || [],
            primaryLanguage: analysis?.primaryLanguage || "",
            deployStrategy: state.deployStrategy,
            buildMethod: "codebuild",
            skipPipeline: true,
          });
          codebuildDeployId = dep.id;
          setState(prev => ({ ...prev, deploymentId: dep.id }));
        } catch {}

        const ts1 = new Date().toISOString().replace("T", " ").slice(0, 19);
        formattedLogs.push(
          `[${ts1}] ── Build Image (CodeBuild) ────────`,
          `[${ts1}] ℹ Build queued: ${build.codebuildId || build.id}`,
        );
        setState(prev => ({ ...prev, codebuildBuildId: build.id, codebuildLogsUrl: build.logsUrl, deployLogs: [...formattedLogs] }));

        // Helper to sync logs to deploy record
        const syncDeployRecord = (status: "building" | "deploying" | "success" | "failed", logs: string[], appUrl?: string) => {
          if (!codebuildDeployId) return;
          deployApi.updateDeployment(codebuildDeployId, {
            status,
            logs: logs.join("\n"),
            ...(appUrl ? { appUrl } : {}),
          }).catch(() => {});
        };
        syncDeployRecord("building", formattedLogs);

        const seenPhases = new Set<string>();

        // Poll CodeBuild until image is ready
        const pollCodeBuild = async () => {
          try {
            const b = await imageBuilderApi.getBuild(build.id);
            const ts = new Date().toISOString().replace("T", " ").slice(0, 19);

            // Parse CodeBuild phase from CloudWatch logs
            try {
              const logsResp = await imageBuilderApi.getBuildLogs(build.id);
              if (logsResp.logs.length > 0) {
                // Extract phase info from raw logs
                for (const line of logsResp.logs) {
                  const phaseMatch = line.match(/Entering phase (\w+)/);
                  if (phaseMatch && !seenPhases.has(phaseMatch[1])) {
                    seenPhases.add(phaseMatch[1]);
                    formattedLogs.push(`[${ts}] ℹ CodeBuild: ${phaseMatch[1]}...`);
                  }
                }
              }
            } catch {}

            if (b.status === "succeeded") {
              formattedLogs.push(
                `[${ts}] ✓ CodeBuild succeeded — image pushed to ECR`,
                `[${ts}]`,
                `[${ts}] ── CloudFormation Deploy ──────────`,
              );
              setState(prev => ({
                ...prev,
                codebuildImageUri: b.imageUri,
                deployStatus: "deploying",
                deployAppUrl: "",
                deployLogs: [...formattedLogs],
              }));
              syncDeployRecord("deploying", formattedLogs);

              const pollCfnDeploy = async () => {
                try {
                  const ds = await imageBuilderApi.getDeployStatus(build.id);
                  const ts2 = new Date().toISOString().replace("T", " ").slice(0, 19);

                  if (ds.status === "success" && ds.appUrl) {
                    const appName = state.tofuAppName || project.name?.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || repo.split("/").pop() || "app";
                    formattedLogs.push(
                      `[${ts2}] ✓ CloudFormation stack: CREATE_COMPLETE`,
                      `[${ts2}] ✓ App URL: ${ds.appUrl}`,
                      `[${ts2}]`,
                      `[${ts2}] ── Complete ───────────────────────`,
                      `[${ts2}] ✓ Docker image: ${appName}`,
                      `[${ts2}] ✓ Infrastructure deployed via CloudFormation`,
                      `[${ts2}] ✓ Application URL: ${ds.appUrl}`,
                    );
                    setState(prev => ({
                      ...prev,
                      deployStatus: "success",
                      deployAppUrl: ds.appUrl,
                      deployLogs: [...formattedLogs],
                    }));
                    syncDeployRecord("success", formattedLogs, ds.appUrl);
                    onDeployComplete?.();
                    return;
                  }
                  if (ds.status === "failed") {
                    formattedLogs.push(`[${ts2}] ✗ CloudFormation failed`);
                    setState(prev => ({ ...prev, deployStatus: "failed", deployLogs: [...formattedLogs] }));
                    syncDeployRecord("failed", formattedLogs);
                    setDeployError("CloudFormation deployment failed.");
                    onDeployComplete?.();
                    return;
                  }
                  if (ds.status === "deploying") {
                    const lastCfnLog = formattedLogs.filter(l => l.includes("CloudFormation:")).pop();
                    const lastCfnTime = lastCfnLog?.match(/\[([\d\s:-]+)\]/)?.[1] || "";
                    // Add periodic status updates (not just the first one)
                    if (!lastCfnLog || lastCfnTime !== ts2) {
                      formattedLogs.push(`[${ts2}] ℹ CloudFormation: CREATE_IN_PROGRESS...`);
                      setState(prev => ({ ...prev, deployLogs: [...formattedLogs] }));
                      syncDeployRecord("deploying", formattedLogs);
                    }
                  }
                  pollRef.current = setTimeout(pollCfnDeploy, 10000);
                } catch {
                  pollRef.current = setTimeout(pollCfnDeploy, 10000);
                }
              };
              pollRef.current = setTimeout(pollCfnDeploy, 5000);
              return;
            }

            if (b.status === "failed" || b.status === "stopped") {
              // Fetch final logs on failure
              try {
                const logsResp = await imageBuilderApi.getBuildLogs(build.id);
                if (logsResp.logs.length > 0) {
                  const failLogs = [
                    ...logsResp.logs,
                    `[${ts}] ✗ CodeBuild failed: ${b.statusReason || "Unknown error"}`,
                  ];
                  setState(prev => ({
                    ...prev,
                    deployStatus: "failed",
                    deployLogs: failLogs,
                  }));
                  syncDeployRecord("failed", failLogs);
                  setDeployError(`CodeBuild failed: ${b.statusReason || "Check logs above"}`);
                  return;
                }
              } catch { /* fall through to basic message */ }

              setState(prev => ({
                ...prev,
                deployStatus: "failed",
                deployLogs: [
                  ...prev.deployLogs,
                  `[${ts}] ✗ CodeBuild failed: ${b.statusReason || "Unknown error"}`,
                ],
              }));
              syncDeployRecord("failed", [...formattedLogs, `[${ts}] ✗ CodeBuild failed: ${b.statusReason || "Unknown error"}`]);
              setDeployError(`CodeBuild failed: ${b.statusReason || "Check CloudWatch logs"}`);
              return;
            }

            // Still in progress
            pollRef.current = setTimeout(pollCodeBuild, 5000);
          } catch {
            pollRef.current = setTimeout(pollCodeBuild, 5000);
          }
        };
        pollRef.current = setTimeout(pollCodeBuild, 3000);
        return;
      }

      // ── Standard path: local build via deploy service ──
      const deployment = await deployApi.createDeployment({
        providerId: state.selectedProviderId,
        gitConnectionId: project.connectionId,
        repo,
        branch: project.branch || "main",
        tofuScript: state.tofuScript || undefined,
        techStack: analysis?.techStack.map(t => t.name) || [],
        primaryLanguage: analysis?.primaryLanguage || "",
        deployStrategy: state.deployStrategy,
        buildMethod: state.buildMethod,
      });
      setState(prev => ({ ...prev, deploymentId: deployment.id }));

      // Poll for status
      const poll = async () => {
        try {
          const d = await deployApi.getDeployment(deployment.id);
          setState(prev => ({
            ...prev,
            deployStatus: d.status,
            deployLogs: d.logs ? d.logs.split("\n").filter(Boolean) : prev.deployLogs,
            deployAppUrl: d.appUrl || prev.deployAppUrl,
          }));
          if (d.status === "success" || d.status === "failed") {
            if (d.status === "failed") setDeployError("Deployment failed. Check logs for details.");
            onDeployComplete?.();
            return;
          }
          pollRef.current = setTimeout(poll, 1500);
        } catch {
          pollRef.current = setTimeout(poll, 2000);
        }
      };
      pollRef.current = setTimeout(poll, 1000);
    } catch (err: any) {
      setDeployError(err.message || "Failed to start deployment");
      setState(prev => ({ ...prev, deployStatus: "failed" }));
    }
  }, [state, project, analysis, onDeployComplete]);

  // Step validation
  const canNext = (): boolean => {
    switch (step) {
      case 0: return !!state.selectedProvider && !!state.selectedProviderId;
      case 1: return !!state.deployStrategy;
      case 2: return !analysisLoading; // wait for analysis to finish, then allow next
      case 3: return state.selectedPlan >= 0;
      case 4: return !tofuLoading;
      default: return false;
    }
  };

  const handleNext = async () => {
    if (step === 4) {
      // Moving to deploy step — start deployment
      setStep(5);
      startDeploy();
      return;
    }
    if (step === 3) {
      // Moving to compose step — generate script
      setStep(4);
      generateScript();
      return;
    }
    setStep(prev => Math.min(prev + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    if (step === 5) return; // can't go back during deploy
    setStep(prev => Math.max(prev - 1, 0));
  };

  const isDeploying = ["pending", "building", "deploying"].includes(state.deployStatus);
  const isFinished = state.deployStatus === "success" || state.deployStatus === "failed";

  return (
    <Modal
      open={open}
      onClose={() => { if (!isDeploying) onClose(); }}
      title={step === 5 ? "Deploying…" : `Deploy — ${STEPS[step].icon} ${STEPS[step].label}`}
      size="xl"
    >
      <Stepper current={step} steps={STEPS} />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {step === 0 && (
          <StepProvider
            state={state}
            providers={providers}
            onChange={(provider, providerId) => setState(prev => ({
              ...prev,
              selectedProvider: provider,
              selectedProviderId: providerId,
              tofuRegion: PROVIDER_REGIONS[provider]?.[0]?.id || "",
            }))}
          />
        )}
        {step === 1 && (
          <StepService
            state={state}
            onChange={(strategy) => setState(prev => ({ ...prev, deployStrategy: strategy }))}
          />
        )}
        {step === 2 && (
          <StepAnalysis
            state={state}
            analysis={analysis}
            analysisLoading={analysisLoading}
            analysisError={analysisError}
            onChange={(modes) => setState(prev => ({ ...prev, servicesModes: modes }))}
          />
        )}
        {step === 3 && (
          <StepEnvironment
            state={state}
            onChange={(env, plan) => setState(prev => ({ ...prev, environment: env, selectedPlan: plan }))}
            onRegionChange={(region) => setState(prev => ({ ...prev, tofuRegion: region }))}
          />
        )}
        {step === 4 && (
          <StepCompose
            state={state}
            loading={tofuLoading}
            error={tofuError}
            onToggleDocker={() => {
              const next = !state.useDocker;
              setState(prev => ({ ...prev, useDocker: next, tofuScript: "" }));
              generateScript({ useDocker: next });
            }}
            onBuildMethodChange={(method) => setState(prev => ({ ...prev, buildMethod: method }))}
            onEnvChange={(envVars) => setState(prev => ({ ...prev, envVars }))}
          />
        )}
        {step === 5 && <StepDeploy state={state} />}
      </div>

      {/* Errors */}
      {deployError && step === 5 && (
        <div className="mt-3 rounded-lg bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">{deployError}</div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
        <div>
          {step > 0 && step < 5 && (
            <button type="button" onClick={handleBack} className={btnSecondary}>
              ← Back
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {step === 5 && isFinished && (
            <button type="button" onClick={onClose} className={btnSecondary}>
              Close
            </button>
          )}
          {step === 5 && state.deployStatus === "failed" && (
            <button type="button" onClick={startDeploy} className={btnPrimary + " flex items-center gap-1.5"}>
              ↻ Retry
            </button>
          )}
          {step < 5 && !isDeploying && (
            <>
              <button type="button" onClick={() => { if (!isDeploying) onClose(); }} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!canNext()}
                className={`${btnPrimary} disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5`}
              >
                {step === 4 ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                    </svg>
                    Deploy
                  </>
                ) : (
                  "Next →"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
