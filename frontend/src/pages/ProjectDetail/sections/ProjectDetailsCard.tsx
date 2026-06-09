import type { Project } from "../../../types";
import { cardCls } from "../../../utils/styles";
import SourceControlBadge from "../../../components/SourceControlBadge";

interface Props {
  project: Project;
  lastCommitDate?: string;
}

const templateLabels: Record<string, string> = {
  wordpress: "WordPress",
};

function detectProvider(repo: string): string {
  if (!repo) return "git";
  if (repo.includes("github")) return "github";
  if (repo.includes("gitlab")) return "gitlab";
  if (repo.includes("bitbucket")) return "bitbucket";
  return "git";
}

export default function ProjectDetailsCard({ project, lastCommitDate }: Props) {
  const isTemplate = project.sourceType === "template";

  return (
    <div className={`${cardCls} p-5 h-full flex flex-col`}>
      <h2 className="text-sm font-semibold text-text mb-4">Details</h2>
      <div className="flex-1 flex flex-col space-y-3">
        <div>
          <p className="text-xs text-text-muted">Project ID</p>
          <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-secondary-50 border border-border text-[11px] text-text-muted font-mono select-all">{project.id}</span>
        </div>
        <div>
          <p className="text-xs text-text-muted">Source</p>
          <div className="flex items-center gap-2 mt-0.5">
            {isTemplate ? (
              <>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 text-xs font-medium">
                  <svg viewBox="0 0 24 24" className="size-3.5 " fill="currentColor">
                    <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm-1.508 14.59L7.36 8.592c.486-.024.924-.072.924-.072.434-.048.386-.69-.05-.666 0 0-1.308.102-2.15.102-.152 0-.33-.004-.518-.012A8.01 8.01 0 0 1 12 4c2.357 0 4.506.958 6.053 2.508-.038-.002-.076-.008-.116-.008-.77 0-1.316.67-1.316 1.39 0 .646.372 1.192.77 1.838.298.522.646 1.192.646 2.16 0 .67-.258 1.448-.596 2.53l-.782 2.612-2.832-8.438c.486-.024.924-.072.924-.072.434-.048.386-.69-.05-.666 0 0-1.308.102-2.15.102-.15 0-.328-.004-.514-.01l-.004.002zM16.4 17.2l-2.546-7.31c.476-1.41.634-2.538.634-3.542 0-.364-.024-.702-.066-1.014A7.97 7.97 0 0 1 20 12c0 2.14-.84 4.082-2.208 5.516l-.002.002-1.39-4.318zm-12.4-5.2c0-1.4.36-2.714.992-3.858l3.462 9.486A8.013 8.013 0 0 1 4 12zm8 8c-.876 0-1.716-.14-2.504-.4l2.66-7.726 2.724 7.462c.018.044.04.084.062.124A7.96 7.96 0 0 1 12 20z" />
                  </svg>
                  {templateLabels[project.template || ""] || project.template || "Template"}
                </span>
              </>
            ) : (
              <SourceControlBadge provider={detectProvider(project.repository)} iconSize="w-4 h-4" />
            )}
          </div>
        </div>
        <div>
          <p className="text-xs text-text-muted">Created</p>
          <p className="text-xs text-text-secondary mt-0.5">{new Date(project.createdAt).toLocaleString()}</p>
        </div>
        {lastCommitDate && (
          <div>
            <p className="text-xs text-text-muted">Last Commit</p>
            <p className="text-xs text-text-secondary mt-0.5">{new Date(lastCommitDate).toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}
