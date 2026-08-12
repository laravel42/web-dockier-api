import { useState } from "react";
import type { Project, RepoStats } from "@/types";
import { cardCls } from "@/utils/styles";
import { getRepoKey } from "@/utils/parseOwnerRepo";
import { useProjectSiteUrl } from "@/hooks/useProjectSiteUrl";
import { CheckIcon, ClipboardIcon, ExternalLinkIcon } from "lucide-react";
import BranchCommitLabel from "@/components/BranchCommitLabel";
import ProjectStatsStrip from "./ProjectStatsStrip";

interface Props {
  project: Project;
  deployUrl?: string;
  stats?: RepoStats | null;
  statsLoading?: boolean;
  statsError?: string;
}

function CopyableMonoValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5 mt-0.5 max-w-full">
      <span className="inline-block px-2 py-0.5 rounded bg-secondary-50 border border-border text-[11px] text-text-muted font-mono select-all">
        {value}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy ${label}`}
        className="shrink-0 p-0.5 rounded text-text-muted hover:text-text transition-colors"
      >
        {copied ? <CheckIcon className="size-3.5 text-primary-500" /> : <ClipboardIcon className="size-3.5" />}
      </button>
    </span>
  );
}

export default function ProjectDetailsCard({
  project,
  deployUrl,
  stats = null,
  statsLoading = false,
  statsError = "",
}: Props) {
  const repoKey = project.repository ? getRepoKey(project.repository) : null;
  const hasRepo = Boolean(project.connectionId && project.repository);
  const viewUrl = useProjectSiteUrl(
    project.id,
    deployUrl,
    project.infraState === "torn_down",
  );

  return (
    <div className={`${cardCls} p-5 h-full flex flex-col`}>
      <h2 className="text-sm font-semibold text-text mb-4">Details</h2>
      <div className="flex-1 flex flex-col space-y-4">
        <div>
          <p className="text-xs text-text-muted">Project ID</p>
          <CopyableMonoValue value={project.id} label="project ID" />
        </div>
        {repoKey && (
          <div>
            <p className="text-xs text-text-muted">Repository path</p>
            <CopyableMonoValue value={repoKey} label="repository path" />
          </div>
        )}
        {hasRepo && (
          <div>
            <p className="text-xs text-text-muted">Branch</p>
            <div className="mt-0.5">
              <BranchCommitLabel
                branch={project.branch || "main"}
                commit={stats?.lastCommitHash || undefined}
              />
            </div>
          </div>
        )}
        {hasRepo && (
          <div>
            <p className="text-xs text-text-muted mb-2">Statistics</p>
            <ProjectStatsStrip
              stats={stats}
              statsLoading={statsLoading}
              statsError={statsError}
              embedded
            />
          </div>
        )}
        {project.infraState === "torn_down" && (
          <div className="mt-auto pt-3 border-t border-border">
            <p className="text-xs text-text-muted">Site URL</p>
            <p className="mt-0.5 text-sm text-text-muted">
              Infrastructure torn down — redeploy to bring the app back online.
            </p>
          </div>
        )}
        {project.infraState !== "torn_down" && viewUrl && (
          <div className="mt-auto pt-3 border-t border-border">
            <p className="text-xs text-text-muted">Site URL</p>
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-primary-500 hover:text-primary-400 transition-colors break-all"
            >
              {viewUrl.replace(/^https?:\/\//, "")}
              <ExternalLinkIcon className="size-3.5 shrink-0" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
