import type { Project, RepoStats } from "@/types";
import { cardCls } from "@/utils/styles";
import { timeAgo } from "@/utils/timeAgo";
import GitCommitIcon from "@/components/icons/outlined/GitCommitIcon";
import SourceControlBadge from "@/components/SourceControlBadge";
import ProjectTechBadges from "@/components/ProjectTechBadges";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { langColors } from "../constants";

interface Props {
  project: Project;
  stats: RepoStats | null;
  badges?: Array<{ name: string; category: string; confidence: number }>;
  allBadges?: Array<{ name: string; category: string; confidence: number }>;
}

const templateDescriptions: Record<string, string> = {
  wordpress: "Full WordPress setup with MySQL database, ready to deploy.",
};

function labelCls() {
  return "text-xs text-text-muted";
}

function detectProvider(repo: string): string {
  if (!repo) return "git";
  if (repo.includes("github")) return "github";
  if (repo.includes("gitlab")) return "gitlab";
  if (repo.includes("bitbucket")) return "bitbucket";
  return "git";
}

function valueLinkCls() {
  return "text-sm text-primary-500 hover:text-primary-700 transition-colors truncate block mt-0.5";
}

function formatLangPct(pct: number): string {
  return pct < 1 ? "<1" : String(Math.round(pct));
}

function langTooltipLabel(lang: string, pct: number): string {
  return `${lang} · ${formatLangPct(pct)}%`;
}

function RepoLanguageBreakdown({ stats }: { stats: RepoStats }) {
  const langs = stats.languages
    ? Object.entries(stats.languages)
        .filter(([, pct]) => pct >= 0.1)
        .sort(([, a], [, b]) => b - a)
    : [];

  if (langs.length === 0) return null;

  const visibleLangs = langs.slice(0, 4);
  const hiddenLangs = langs.slice(4);
  const hiddenPct = hiddenLangs.reduce((sum, [, pct]) => sum + pct, 0);
  const ariaLabel = langs.map(([lang, pct]) => `${lang} ${formatLangPct(pct)}%`).join(", ");

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div
          className="flex h-1.5 w-full overflow-hidden rounded-sm bg-border/40"
          role="img"
          aria-label={`Language breakdown: ${ariaLabel}`}
        >
          {langs.map(([lang, pct], i) => (
            <Tooltip key={lang}>
              <TooltipTrigger asChild>
                <div
                  className={`h-full ${langColors[i % langColors.length]}`}
                  style={{ width: `${Math.max(pct, 0.5)}%` }}
                />
              </TooltipTrigger>
              <TooltipContent side="top">{langTooltipLabel(lang, pct)}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {visibleLangs.map(([lang, pct], i) => (
          <span key={lang} className="inline-flex items-center gap-1.5 text-xs">
            <span
              className={`size-2 shrink-0 rounded-[2px] ${langColors[i % langColors.length]}`}
              aria-hidden="true"
            />
            <span className="font-medium text-text">{lang}</span>
            <span className="tabular-nums text-text-muted">{formatLangPct(pct)}%</span>
          </span>
        ))}
        {hiddenLangs.length > 0 && (
          <span className="text-xs tabular-nums text-text-muted">
            +{hiddenLangs.length} more
            {hiddenPct >= 0.1 ? ` (${formatLangPct(hiddenPct)}%)` : ""}
          </span>
        )}
      </div>
      </div>
    </TooltipProvider>
  );
}

export default function RepoInfoCard({ project, stats, badges, allBadges }: Props) {
  const isTemplate = project.sourceType === "template";
  const displayBadges = allBadges && allBadges.length > 0 ? allBadges : badges;
  const hasLanguageBreakdown = Boolean(
    stats?.languages && Object.values(stats.languages).some((pct) => pct >= 0.1),
  );

  if (isTemplate) {
    return (
      <div className={`${cardCls} p-5 h-full flex flex-col`}>
        <h2 className="text-sm font-semibold text-text mb-4">Template</h2>
        <div className="flex-1 flex flex-col space-y-4">
          <div>
            <p className={labelCls()}>Source</p>
            <a href={project.repository} target="_blank" rel="noopener noreferrer" className={valueLinkCls()}>
              {project.repository}
            </a>
          </div>
          <div>
            <p className={labelCls()}>Branch</p>
            <p className="text-sm text-text-secondary mt-0.5">{project.branch || "main"}</p>
          </div>
          {project.template && templateDescriptions[project.template] && (
            <div className="mt-auto pt-3 border-t border-border">
              <p className={labelCls()}>About</p>
              <p className="text-xs/relaxed text-text-secondary mt-1 ">
                {templateDescriptions[project.template]}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${cardCls} p-5 h-full flex flex-col`}>
      <h2 className="text-sm font-semibold text-text mb-4">Repository</h2>
      <div className="flex-1 flex flex-col space-y-4 min-h-0">
        <div>
          <p className={labelCls()}>Remote</p>
          {project.repository ? (
            <a
              href={project.repository}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 flex items-center gap-1.5 text-sm text-primary-500 hover:text-primary-700 transition-colors min-w-0"
            >
              <SourceControlBadge provider={detectProvider(project.repository)} showName={false} />
              <span className="truncate">{project.repository}</span>
            </a>
          ) : (
            <p className="text-sm text-text-muted mt-0.5">No repository linked</p>
          )}
        </div>

        {stats?.lastCommitHash && (
          <div>
            <p className={labelCls()}>Latest commit</p>
            <div className="mt-1 flex items-start gap-2 min-w-0">
              <GitCommitIcon className="size-4 text-text-muted shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                {stats.lastCommitMessage && (
                  <a
                    href={`${project.repository}/-/commit/${stats.lastCommitHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-text hover:text-primary-500 transition-colors truncate block"
                  >
                    {stats.lastCommitMessage}
                  </a>
                )}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted mt-0.5">
                  <span className="font-mono text-primary-500">{stats.lastCommitHash.substring(0, 7)}</span>
                  {stats.lastCommitAuthor && (
                    <>
                      <span>·</span>
                      <span>{stats.lastCommitAuthor}</span>
                    </>
                  )}
                  {stats.lastCommitDate && (
                    <>
                      <span>·</span>
                      <span>{timeAgo(stats.lastCommitDate)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {((displayBadges && displayBadges.length > 0) || (stats && hasLanguageBreakdown)) && (
          <div className="space-y-3">
            {displayBadges && displayBadges.length > 0 && (
              <>
                <p className={`${labelCls()} mb-2`}>Tech stack</p>
                <ProjectTechBadges badges={displayBadges} limit={8} />
              </>
            )}
            {stats && hasLanguageBreakdown && (
              <>
                <p className={`${labelCls()} mb-2`}>Languages</p>
                <RepoLanguageBreakdown stats={stats} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
