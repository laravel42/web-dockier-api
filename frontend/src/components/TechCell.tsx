import ProjectTechBadges from "./ProjectTechBadges";
import type { TechBadgeInfo } from "../types";

interface TechCellProps {
  projectId: string;
  projectLangs: Record<string, TechBadgeInfo[]>;
  projectBadgeLoading: ReadonlySet<string>;
  platform?: string;
}

/**
 * Shared table cell for the Tech column on list pages (Projects, Deploy, Security Scans).
 * Renders up to 3 tech badges with a consistent loading + empty state.
 */
export default function TechCell({ projectId, projectLangs, projectBadgeLoading, platform }: TechCellProps) {
  return (
    <ProjectTechBadges
      badges={projectLangs[projectId]}
      loading={projectBadgeLoading.has(projectId)}
      platform={platform}
      limit={3}
      emptyPlaceholder={<span className="text-ui-sm text-text-muted">—</span>}
    />
  );
}
