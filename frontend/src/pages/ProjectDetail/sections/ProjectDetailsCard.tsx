import { useMemo, useState, type ReactNode } from "react";
import type { CommitInfo, Project, RepoStats } from "@/types";
import { cardCls } from "@/utils/styles";
import { getRepoKey, parseOwnerRepo } from "@/utils/parseOwnerRepo";
import { useProjectSiteUrl } from "@/hooks/useProjectSiteUrl";
import { useAsyncData } from "@/hooks/useAsyncData";
import { gitApi } from "@/services/api";
import { timeAgo } from "@/utils/timeAgo";
import SourceControlBadge from "@/components/SourceControlBadge";
import ProjectTechBadges from "@/components/ProjectTechBadges";
import BranchCommitLabel from "@/components/BranchCommitLabel";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckIcon, ClipboardIcon, ExternalLinkIcon } from "lucide-react";
import { langColors } from "../constants";
import ContributorsGrid from "./ContributorsGrid";
import ProjectStatsStrip from "./ProjectStatsStrip";

interface Props {
  project: Project;
  deployUrl?: string;
  /** SHA of the latest successful deploy — the branch chip must not use a scan SHA. */
  deployedCommitHash?: string;
  stats?: RepoStats | null;
  statsLoading?: boolean;
  statsError?: string;
  badges?: Array<{ name: string; category: string; confidence: number }>;
  allBadges?: Array<{ name: string; category: string; confidence: number }>;
  nameByLogin?: Record<string, string>;
  recentCommits?: CommitInfo[];
}

/** Short and full SHAs from different sources should still match. */
function sameCommit(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/**
 * How far `known` sits behind `head` in a newest-first commit list.
 * Returns null when up to date.
 */
function commitsBehind(
  head?: string,
  known?: string,
  commits: Array<{ hash: string }> = [],
): { count: number; capped: boolean } | null {
  if (!head || !known || sameCommit(head, known)) return null;
  const idx = commits.findIndex((c) => sameCommit(c.hash, known));
  if (idx > 0) return { count: idx, capped: false };
  if (idx === 0) return null;
  // Known commit is older than the window — report at least the window size.
  if (commits.length > 0 && sameCommit(commits[0].hash, head)) {
    return { count: commits.length, capped: true };
  }
  // Hashes differ but `known` is not in the list yet (still loading, or older
  // than the window). Still behind the tip — at least one commit.
  return { count: 1, capped: true };
}

const templateDescriptions: Record<string, string> = {
  wordpress: "Full WordPress setup with MySQL database, ready to deploy.",
};

const fieldLabelCls = "text-ui font-semibold text-text-muted";

const specCellCls =
  "flex h-full min-w-0 items-start gap-3 border-b border-border/40 py-2.5 last:border-b-0 md:odd:border-r md:odd:border-border/40 md:odd:pr-8 md:even:pl-8 md:[&:nth-child(n+5)]:border-b-0";

function SpecRow({
  label,
  children,
  action,
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={specCellCls}>
      <span className={`w-[3.75rem] shrink-0 ${fieldLabelCls}`}>{label}</span>
      <div className="min-w-0 flex-1 text-ui text-text">{children}</div>
      {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
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
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy ${label}`}
      className="inline-flex size-5 items-center justify-center text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500/40"
    >
      {copied ? <CheckIcon className="size-3.5 text-primary-500" /> : <ClipboardIcon className="size-3.5" />}
    </button>
  );
}

function detectProvider(repo: string): string {
  if (!repo) return "git";
  if (repo.includes("github")) return "github";
  if (repo.includes("gitlab")) return "gitlab";
  if (repo.includes("bitbucket")) return "bitbucket";
  return "git";
}

function commitHref(repo: string, hash: string): string {
  const base = repo.replace(/\/$/, "");
  if (repo.includes("github.com")) return `${base}/commit/${hash}`;
  return `${base}/-/commit/${hash}`;
}

function formatLangPct(pct: number): string {
  return pct < 1 ? "<1" : String(Math.round(pct));
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
              <TooltipContent side="top">{`${lang} · ${formatLangPct(pct)}%`}</TooltipContent>
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

export default function ProjectDetailsCard({
  project,
  deployUrl,
  deployedCommitHash,
  stats = null,
  statsLoading = false,
  statsError = "",
  badges,
  allBadges,
  nameByLogin,
  recentCommits = [],
}: Props) {
  const isTemplate = project.sourceType === "template";
  const repoKey = project.repository ? getRepoKey(project.repository) : null;
  const hasRepo = Boolean(project.connectionId && project.repository);
  const viewUrl = useProjectSiteUrl(
    project.id,
    deployUrl,
    project.infraState === "torn_down",
  );
  const displayBadges = allBadges && allBadges.length > 0 ? allBadges : badges;
  const hasLanguageBreakdown = Boolean(
    stats?.languages && Object.values(stats.languages).some((pct) => pct >= 0.1),
  );

  // SHA on the chip must match the Commit row: that's the deployed snapshot
  // (stats.lastCommitHash). A newer success-deploy record or the activity tip
  // can be HEAD (ad0aac2) while the running site is still the older SHA.
  const knownCommit = stats?.lastCommitHash || deployedCommitHash || undefined;
  const parsedRepo = useMemo(
    () => (project.repository ? parseOwnerRepo(project.repository) : null),
    [project.repository],
  );

  // Live remote tip. Always fetch when we have a known SHA — do not wait until
  // stats (often cached at the deploy SHA) already disagrees. API max is 20.
  const { data: tipCommits } = useAsyncData(
    () =>
      gitApi
        .getRecentCommits(
          project.connectionId,
          parsedRepo!.owner,
          parsedRepo!.repo,
          project.branch || undefined,
          20,
        )
        .then((res) => res.commits),
    [project.id, project.connectionId, project.branch],
    { enabled: Boolean(hasRepo && !isTemplate && knownCommit && parsedRepo) },
  );

  const headCommit = tipCommits?.[0]?.hash || recentCommits[0]?.hash || undefined;
  const lastCommit = tipCommits?.[0] ?? recentCommits[0] ?? null;

  const behind = useMemo(
    () => commitsBehind(headCommit, knownCommit, tipCommits ?? recentCommits),
    [headCommit, knownCommit, tipCommits, recentCommits],
  );

  const branchCommit = knownCommit;

  if (isTemplate) {
    return (
      <section className={`${cardCls} mb-6 p-5`} aria-labelledby="project-details-heading">
        <h2 id="project-details-heading" className="mb-4 text-sm font-semibold text-text">
          Details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2">
          <SpecRow label="Source">
            <a
              href={project.repository}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-primary-500 transition-colors hover:text-primary-700"
            >
              {project.repository}
            </a>
          </SpecRow>
          <SpecRow label="Branch">
            <span>{project.branch || "main"}</span>
          </SpecRow>
        </div>
        {project.template && templateDescriptions[project.template] && (
          <div className="mt-4">
            <p className={fieldLabelCls}>About</p>
            <p className="mt-1 text-xs/relaxed text-text-secondary">
              {templateDescriptions[project.template]}
            </p>
          </div>
        )}
      </section>
    );
  }

  const siteHost = viewUrl ? viewUrl.replace(/^https?:\/\//, "") : null;

  return (
    <section className={`${cardCls} mb-6 p-5`} aria-labelledby="project-details-heading">
      <h2 id="project-details-heading" className="mb-4 text-sm font-semibold text-text">
        Details
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2">
        <SpecRow
          label="ID"
          action={<CopyButton value={project.id} label="project ID" />}
        >
          <span className="break-all font-mono">{project.id}</span>
        </SpecRow>

        <SpecRow label="Remote">
          {project.repository ? (
            <a
              href={project.repository}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 items-center gap-1.5 text-primary-500 transition-colors hover:text-primary-700"
            >
              <SourceControlBadge provider={detectProvider(project.repository)} showName={false} />
              <span className="truncate">{project.repository}</span>
            </a>
          ) : (
            <span className="text-text-muted">No repository linked</span>
          )}
        </SpecRow>

        <SpecRow
          label="Path"
          action={repoKey ? <CopyButton value={repoKey} label="repository path" /> : undefined}
        >
          {repoKey ? (
            <span className="truncate font-mono">{repoKey}</span>
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </SpecRow>

        <SpecRow label="Commit">
          {stats?.lastCommitHash ? (
            <div className="min-w-0">
              {stats.lastCommitMessage && (
                <a
                  href={commitHref(project.repository, stats.lastCommitHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate font-medium text-text transition-colors hover:text-primary-500"
                >
                  {stats.lastCommitMessage}
                </a>
              )}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
                <span className="font-mono text-primary-500">{stats.lastCommitHash.substring(0, 7)}</span>
                {stats.lastCommitAuthor && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{stats.lastCommitAuthor}</span>
                  </>
                )}
                {stats.lastCommitDate && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{timeAgo(stats.lastCommitDate)}</span>
                  </>
                )}
              </p>
            </div>
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </SpecRow>

        <SpecRow
          label="Site"
          action={
            project.infraState !== "torn_down" && viewUrl ? (
              <a
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open site"
                className="inline-flex size-5 items-center justify-center text-text-muted transition-colors hover:text-primary-500"
              >
                <ExternalLinkIcon className="size-3.5" />
              </a>
            ) : undefined
          }
        >
          {project.infraState === "torn_down" ? (
            <span className="text-text-muted">Torn down — redeploy to bring the app back online.</span>
          ) : siteHost ? (
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-primary-500 transition-colors hover:text-primary-700"
            >
              {siteHost}
            </a>
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </SpecRow>

        <SpecRow label="Branch">
          {hasRepo ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <BranchCommitLabel
                branch={project.branch || "main"}
                commit={branchCommit}
              />
              {behind && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="cursor-help border-0 border-b border-dashed border-warning-ink bg-transparent p-0 text-xs text-warning-ink tabular-nums"
                      >
                        {behind.count}{behind.capped ? "+" : ""} commit
                        {behind.count === 1 && !behind.capped ? "" : "s"} behind origin
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs space-y-0.5">
                      <p className="font-medium">Last commit</p>
                      <p className="font-mono tabular-nums">
                        {(lastCommit?.hash || headCommit || "—").slice(0, 7)}
                      </p>
                      {(lastCommit?.message || stats?.lastCommitMessage) && (
                        <p className="text-popover-foreground/80">
                          {lastCommit?.message || stats?.lastCommitMessage}
                        </p>
                      )}
                      {(lastCommit?.author || stats?.lastCommitAuthor || lastCommit?.date || stats?.lastCommitDate) && (
                        <p className="text-popover-foreground/60">
                          {[
                            lastCommit?.author || stats?.lastCommitAuthor,
                            (lastCommit?.date || stats?.lastCommitDate)
                              ? timeAgo(lastCommit?.date || stats?.lastCommitDate || "")
                              : null,
                          ].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          ) : (
            <span className="text-text-muted">—</span>
          )}
        </SpecRow>
      </div>

      {((displayBadges && displayBadges.length > 0) || (stats && hasLanguageBreakdown) || hasRepo) && (
        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-0">
          <div className="min-w-0 md:border-r md:border-border/40 md:pr-8">
            {displayBadges && displayBadges.length > 0 && (
              <>
                <p className={`${fieldLabelCls} mb-2`}>Tech stack</p>
                <ProjectTechBadges badges={displayBadges} limit={8} />
              </>
            )}
            {stats && hasLanguageBreakdown && (
              <div className={displayBadges && displayBadges.length > 0 ? "mt-3" : ""}>
                <p className={`${fieldLabelCls} mb-2`}>Languages</p>
                <RepoLanguageBreakdown stats={stats} />
              </div>
            )}
          </div>

          {hasRepo && (
            <div className="min-w-0 md:pl-8">
              <p className={`${fieldLabelCls} mb-2`}>Statistics</p>
              <ProjectStatsStrip
                stats={stats}
                statsLoading={statsLoading}
                statsError={statsError}
                embedded
                compact
              />
            </div>
          )}
        </div>
      )}

      {stats?.topContributors?.length ? (
        <div className="mt-5 border-t border-border/40 pt-4">
          <ContributorsGrid stats={stats} nameByLogin={nameByLogin} />
        </div>
      ) : null}
    </section>
  );
}
