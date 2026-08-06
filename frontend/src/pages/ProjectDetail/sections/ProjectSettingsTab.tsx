import { useState } from "react";
import type { Project } from "@/types";
import { usePermissions } from "@/context/PermissionsContext";
import { TabSpinner } from "../settings/shared";
import GeneralSection from "../settings/GeneralSection";
import DeploymentsSection from "../settings/DeploymentsSection";
import EnvironmentSection from "../settings/EnvironmentSection";
import WordPressSection from "../settings/WordPressSection";
import ComposerSection from "../settings/ComposerSection";
import NpmSection from "../settings/NpmSection";
import NotificationsSection from "../settings/NotificationsSection";

interface Props {
  project: Project;
  onProjectUpdate?: (project: Project) => void;
}

type SettingsSection =
  | "general"
  | "deployments"
  | "environment"
  | "wordpress"
  | "composer"
  | "npm"
  | "notifications";

export default function ProjectSettingsTab({ project, onProjectUpdate }: Props) {
  const { has, loading: permissionsLoading } = usePermissions();
  const canManage = has("project:manage");
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");

  if (permissionsLoading) return <TabSpinner label="Loading…" />;

  const sections: { key: SettingsSection; label: string }[] = [
    { key: "general", label: "General" },
    { key: "deployments", label: "Deployments" },
    { key: "environment", label: "Environment" },
    ...(project.sourceType === "template" && project.template === "wordpress"
      ? [{ key: "wordpress" as const, label: "WordPress" }]
      : []),
    { key: "composer", label: "Composer" },
    { key: "npm", label: "npm" },
    { key: "notifications", label: "Notifications" },
  ];

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* Left sidebar */}
      <nav className="flex shrink-0 flex-col gap-1 w-36">
        {sections.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => setActiveSection(section.key)}
            className={`text-left px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeSection === section.key
                ? "bg-primary-500/10 text-text border-l-2 border-primary-500"
                : "text-text-muted hover:text-text hover:bg-card/60"
            }`}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {/* Content area */}
      <div className="flex-1 min-w-0 min-h-0 overflow-auto pr-1">
        {activeSection === "general" && (
          <GeneralSection project={project} canManage={canManage} onProjectUpdate={onProjectUpdate} />
        )}
        {activeSection === "deployments" && (
          <DeploymentsSection project={project} canManage={canManage} onProjectUpdate={onProjectUpdate} />
        )}
        {activeSection === "environment" && (
          <EnvironmentSection project={project} canManage={canManage} />
        )}
        {activeSection === "wordpress" && (
          <WordPressSection project={project} canManage={canManage} />
        )}
        {activeSection === "composer" && (
          <ComposerSection canManage={canManage} />
        )}
        {activeSection === "npm" && (
          <NpmSection canManage={canManage} />
        )}
        {activeSection === "notifications" && (
          <NotificationsSection canManage={canManage} />
        )}
      </div>
    </div>
  );
}
