import { useMemo, useState } from "react";
import type { Project } from "@/types";
import { usePermissions } from "@/context/PermissionsContext";
import { panelId, tabId, useTabListKeyboard } from "@/hooks/useTabListKeyboard";
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

  const sections = useMemo((): { key: SettingsSection; label: string }[] => [
    { key: "general", label: "General" },
    { key: "deployments", label: "Deployments" },
    { key: "environment", label: "Environment" },
    ...(project.sourceType === "template" && project.template === "wordpress"
      ? [{ key: "wordpress" as const, label: "WordPress" }]
      : []),
    { key: "composer", label: "Composer" },
    { key: "npm", label: "npm" },
    { key: "notifications", label: "Notifications" },
  ], [project.sourceType, project.template]);
  const sectionKeys = useMemo(() => sections.map((s) => s.key), [sections]);
  const handleSectionKeyDown = useTabListKeyboard(sectionKeys, setActiveSection);

  if (permissionsLoading) return <TabSpinner label="Loading…" />;

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {/* Section nav as a topbar; the panel below owns the full width */}
      <div className="-mx-1 flex shrink-0 items-stretch gap-0.5 overflow-x-auto overflow-y-hidden border-b border-border px-1 pb-2 scrollbar-hide" role="tablist" aria-label="Settings sections">
        {sections.map((section) => (
          <button
            key={section.key}
            type="button"
            role="tab"
            id={tabId(section.key)}
            aria-controls={panelId(section.key)}
            aria-selected={activeSection === section.key}
            tabIndex={activeSection === section.key ? 0 : -1}
            onClick={() => setActiveSection(section.key)}
            onKeyDown={(e) => handleSectionKeyDown(e, section.key)}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeSection === section.key
                ? "bg-primary/10 text-text"
                : "text-text-muted hover:bg-card/60 hover:text-text"
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div
        role="tabpanel"
        id={panelId(activeSection)}
        aria-labelledby={tabId(activeSection)}
        className="flex-1 min-w-0 min-h-0 overflow-auto pr-1"
      >
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
