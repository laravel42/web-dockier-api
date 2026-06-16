import type { ReactNode } from "react";
import type { NavigateFunction } from "react-router-dom";
import {
  btnPrimary,
  featureCardCls,
  marketingHeroDesc,
  marketingHeroTitle,
  marketingSectionDesc,
  marketingSectionTitle,
  overlinePillCls,
} from "../../../utils/styles";
import PlusIcon from "../../../components/icons/outlined/PlusIcon";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";
import ShieldCheckIcon from "../../../components/icons/outlined/ShieldCheckIcon";
import ChatBubbleIcon from "../../../components/icons/outlined/ChatBubbleIcon";
import RocketIcon from "../../../components/icons/outlined/RocketIcon";
import EyeIcon from "../../../components/icons/outlined/EyeIcon";
import LockIcon from "../../../components/icons/outlined/LockIcon";
import WarningIcon from "../../../components/icons/outlined/WarningIcon";
import CodeIcon from "../../../components/icons/outlined/CodeIcon";
import CheckIcon from "../../../components/icons/outlined/CheckIcon";
import IntegrationMarquee from "./IntegrationMarquee";

interface Props {
  navigate: NavigateFunction;
}

interface Feature {
  icon: ReactNode;
  title: string;
  description: string;
  bullets: string[];
}

interface WorkflowStep {
  number: string;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: <ShieldCheckIcon className="size-4" />,
    title: "Vulnerability scans",
    description: "Scan repos on every push and surface CVEs before they reach production.",
    bullets: ["Semgrep + custom rules", "Severity-ranked findings", "Per-project history"],
  },
  {
    icon: <EyeIcon className="size-4" />,
    title: "Security monitoring",
    description: "Monitor findings across projects from a single dashboard view.",
    bullets: ["Unified scan history", "Trend visibility", "Actionable alerts"],
  },
  {
    icon: <LockIcon className="size-4" />,
    title: "Secrets detection",
    description: "Detect exposed API keys, tokens, and credentials in source code.",
    bullets: ["Pattern-based scanner", "High-confidence matches", "File-level context"],
  },
  {
    icon: <WarningIcon className="size-4" />,
    title: "Dependency resilience",
    description: "Track vulnerable dependencies and outdated packages in your stack.",
    bullets: ["Lockfile analysis", "Transitive risk", "Remediation guidance"],
  },
  {
    icon: <ChatBubbleIcon className="size-4" />,
    title: "AI remediation",
    description: "Generate fix pull requests powered by AI to resolve issues quickly.",
    bullets: ["Context-aware fixes", "Branch + MR workflow", "Review before merge"],
  },
  {
    icon: <CodeIcon className="size-4" />,
    title: "IaC scanning",
    description: "Scan Terraform, CloudFormation, and infra configs for misconfigurations.",
    bullets: ["Multi-cloud templates", "Policy violations", "Deploy-time checks"],
  },
];

const WORKFLOW: WorkflowStep[] = [
  {
    number: "01",
    title: "Connect repository",
    description:
      "Link GitHub, GitLab, or Bitbucket. Dockier pulls your code and keeps it in sync.",
  },
  {
    number: "02",
    title: "Analyze & scan",
    description:
      "Dockier detects your stack and runs security scans to surface vulnerabilities.",
  },
  {
    number: "03",
    title: "Fix with AI",
    description:
      "Review findings and generate AI-powered remediation pull requests.",
  },
  {
    number: "04",
    title: "Deploy",
    description:
      "Deploy to AWS or GCP with guided infrastructure provisioning.",
  },
];

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <div className={featureCardCls}>
      <div className="flex size-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary shrink-0">
        {feature.icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text">{feature.title}</h3>
        <p className="mt-1 text-xs/relaxed text-text-muted ">{feature.description}</p>
      </div>
      <ul className="mt-auto space-y-1.5 pt-1">
        {feature.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2 text-xs text-text-muted">
            <CheckIcon className="mt-0.5 size-3 shrink-0 text-primary" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WorkflowStepCard({ step }: { step: WorkflowStep }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="font-display text-2xl font-semibold tabular-nums text-primary/40">
        {step.number}
      </span>
      <h3 className="text-sm font-semibold text-text">{step.title}</h3>
      <p className="text-xs/relaxed text-text-muted ">{step.description}</p>
    </div>
  );
}

export default function GettingStarted({ navigate }: Props) {
  const connect = () => navigate("/projects", { state: { openCreate: true } });

  return (
    <div className="w-full pb-12">
      {/* Hero */}
      <section className="pt-4 pb-2 text-center">
        <h1 className={marketingHeroTitle}>
          AI-native DevSecOps for{" "}
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-primary">modern</span>{" "}
          engineering teams
        </h1>
        <p className={marketingHeroDesc}>
          Connect your repositories, scan for vulnerabilities, fix issues with AI, and deploy to
          AWS or GCP — all from one dashboard.
        </p>
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={connect}
            className={`${btnPrimary} h-10 px-5 text-sm`}
          >
            <PlusIcon className="size-4" />
            Connect repository
          </button>
        </div>
        <IntegrationMarquee />
      </section>

      {/* Feature grid */}
      <section className="mt-20">
        <div className="text-center">
          <span className={overlinePillCls}>All-in-one platform</span>
          <h2 className={`${marketingSectionTitle} mt-4`}>
            Security, AI analysis, and deploys — unified
          </h2>
          <p className={marketingSectionDesc}>
            Everything your team needs to ship securely, without switching between tools.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:gap-5">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section className="mt-20">
        <div className="text-center">
          <span className={overlinePillCls}>Workflow</span>
          <h2 className={`${marketingSectionTitle} mt-4`}>
            From repo to production in four steps
          </h2>
          <p className={marketingSectionDesc}>
            Connect a repository to unlock analysis, security scanning, and deployment.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 xl:gap-10">
          {WORKFLOW.map((step) => (
            <WorkflowStepCard key={step.number} step={step} />
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={connect} className={`${btnPrimary} h-10 px-5`}>
            <LinkIcon className="size-4" strokeWidth={2} />
            Get started
          </button>
          <button
            type="button"
            onClick={() => navigate("/security")}
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium text-text-muted hover:text-text transition-colors"
          >
            <ShieldCheckIcon className="size-4" />
            Explore security scans
          </button>
          <button
            type="button"
            onClick={() => navigate("/deploy")}
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium text-text-muted hover:text-text transition-colors"
          >
            <RocketIcon className="size-4" />
            View deployments
          </button>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative mt-20 overflow-hidden rounded-2xl border border-border/50 bg-card/40 p-8 text-center backdrop-blur sm:p-10">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_100%,oklch(0.78_0.08_70/12%),transparent)]"
          aria-hidden
        />
        <div className="relative">
          <h2 className="font-display text-lg sm:text-xl font-semibold tracking-tight text-foreground">
            Start securing your repositories with AI
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
            Connect your first repo and run a security scan in minutes.
          </p>
          <button
            type="button"
            onClick={connect}
            className={`${btnPrimary} mt-6 h-10 px-5`}
          >
            <PlusIcon className="size-4" />
            Connect repository
          </button>
        </div>
      </section>
    </div>
  );
}
