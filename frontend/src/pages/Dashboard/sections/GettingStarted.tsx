import type { ReactNode } from "react";
import type { NavigateFunction } from "react-router-dom";
import { btnPrimary, btnLink, cardCls, typePanelDesc, typePanelTitle, typeSectionHeading } from "../../../utils/styles";
import PlusIcon from "../../../components/icons/outlined/PlusIcon";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";
import ShieldCheckIcon from "../../../components/icons/outlined/ShieldCheckIcon";
import ChatBubbleIcon from "../../../components/icons/outlined/ChatBubbleIcon";
import RocketIcon from "../../../components/icons/outlined/RocketIcon";
import ChevronRightIcon from "../../../components/icons/outlined/ChevronRightIcon";

interface Props {
  navigate: NavigateFunction;
}

interface Step {
  number: number;
  title: string;
  description: string;
  icon: ReactNode;
  action?: {
    label: string;
    primary?: boolean;
    onClick: () => void;
  };
}

export default function GettingStarted({ navigate }: Props) {
  const steps: Step[] = [
    {
      number: 1,
      title: "Connect repository",
      description:
        "Link your GitHub, GitLab, or Bitbucket repository. Dockier pulls your code and keeps it in sync.",
      icon: <LinkIcon className="size-4" strokeWidth={2} />,
      action: {
        label: "Connect repository",
        primary: true,
        onClick: () => navigate("/projects", { state: { openCreate: true } }),
      },
    },
    {
      number: 2,
      title: "Analyze & scan",
      description:
        "Dockier analyzes your stack and runs security scans to surface vulnerabilities and misconfigurations.",
      icon: <ShieldCheckIcon className="size-4" />,
      action: {
        label: "View projects",
        onClick: () => navigate("/projects"),
      },
    },
    {
      number: 3,
      title: "Fix with AI",
      description:
        "Review findings and generate AI-powered remediation pull requests to resolve issues quickly.",
      icon: <ChatBubbleIcon className="size-4" />,
      action: {
        label: "View security scans",
        onClick: () => navigate("/security"),
      },
    },
    {
      number: 4,
      title: "Deploy",
      description:
        "Deploy to AWS or GCP with guided infrastructure provisioning — VPS or managed services.",
      icon: <RocketIcon className="size-4" />,
      action: {
        label: "Go to deploy",
        onClick: () => navigate("/deploy"),
      },
    },
  ];

  return (
    <section className="mb-8">
      <div className="mb-6">
        <h2 className={typeSectionHeading}>How it works</h2>
        <p className={`${typePanelDesc} mt-1`}>
          Connect a repository to unlock analysis, security scanning, and deployment.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {steps.map((step) => (
          <div key={step.number} className={`${cardCls} p-5 flex flex-col gap-4`}>
            <div className="flex items-start gap-4">
              <div className="flex items-center justify-center size-7 rounded-full bg-primary-500/10 text-primary-500 text-xs font-semibold shrink-0">
                {step.number}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-primary-500 shrink-0">{step.icon}</span>
                  <h3 className={typePanelTitle}>
                    {step.title}
                  </h3>
                </div>
                <p className={`${typePanelDesc} leading-relaxed`}>{step.description}</p>
              </div>
            </div>

            {step.action && (
              <div className="mt-auto pt-1">
                {step.action.primary ? (
                  <button
                    type="button"
                    onClick={step.action.onClick}
                    className={`${btnPrimary} inline-flex items-center gap-2`}
                  >
                    <PlusIcon className="size-4" />
                    {step.action.label}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={step.action.onClick}
                    className={btnLink}
                  >
                    {step.action.label}
                    <ChevronRightIcon className="size-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
