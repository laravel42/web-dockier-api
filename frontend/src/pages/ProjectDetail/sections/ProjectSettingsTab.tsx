import type { Project } from "@/types";
import type { RepoAnalysis } from "@/components/DeployWizard";
import { usePermissions } from "@/context/PermissionsContext";
import { TabSpinner } from "../settings/shared";
import GeneralSection from "../settings/GeneralSection";
import DeploymentsSection from "../settings/DeploymentsSection";
import EnvironmentSection from "../settings/EnvironmentSection";
import WordPressSection from "../settings/WordPressSection";
import ComposerSection from "../settings/ComposerSection";
import NpmSection from "../settings/NpmSection";
import NotificationsSection from "../settings/NotificationsSection";
import type { SettingsSection } from "../settings/settingsNav";

interface Props {
  project: Project;
  section: SettingsSection;
  analysis?: RepoAnalysis | null;
  onProjectUpdate?: (project: Project) => void;
}

export default function ProjectSettingsTab({ project, section, analysis, onProjectUpdate }: Props) {
  const { has, loading: permissionsLoading } = usePermissions();
  const canManage = has("project:manage");

  if (permissionsLoading) return <TabSpinner label="Loading…" />;

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto pr-1">
      {section === "general" && (
        <GeneralSection
          project={project}
          analysis={analysis}
          canManage={canManage}
          onProjectUpdate={onProjectUpdate}
        />
      )}
      {section === "deployments" && (
        <DeploymentsSection project={project} canManage={canManage} onProjectUpdate={onProjectUpdate} />
      )}
      {section === "environment" && (
        <EnvironmentSection project={project} canManage={canManage} />
      )}
      {section === "wordpress" && (
        <WordPressSection project={project} canManage={canManage} />
      )}
      {section === "composer" && <ComposerSection canManage={canManage} />}
      {section === "npm" && <NpmSection canManage={canManage} />}
      {section === "notifications" && <NotificationsSection canManage={canManage} />}
    </div>
  );
}
