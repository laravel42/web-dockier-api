import { Combobox } from "./ui/Combobox";
import Spinner from "./Spinner";
import type { Repo } from "../types";
import { ArchiveIcon, LockIcon, RefreshCwIcon } from "lucide-react";

interface Props {
  value: string;
  /** id of the visible <label> that names this control. */
  labelledBy?: string;
  onChange: (fullName: string) => void;
  repos: Repo[];
  loading?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  /**
   * Called (debounced) with the typed term so the parent can query the server.
   * Only the first page of repos is loaded up front, so this is how repos
   * beyond that page are found. Omit to keep purely local filtering.
   */
  onSearch?: (term: string) => void;
  /** True while a server-side search is in flight. */
  searching?: boolean;
  /** True when more repos exist than were loaded — shows a hint to search. */
  hasMore?: boolean;
}

function repoOption(repo: Repo) {
  return {
    value: repo.fullName,
    label: repo.fullName,
    content: (
      <>
        <ArchiveIcon className="size-4 shrink-0 text-text-muted" />
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{repo.fullName}</span>
          {repo.private && <LockIcon className="size-3.5 shrink-0" aria-label="Private" />}
        </div>
      </>
    ),
  };
}

export default function RepoSelect({ value, onChange, repos, loading, onRefresh, refreshing, labelledBy, onSearch, searching, hasMore }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-text-muted">
        <Spinner className="size-4" />
        Loading…
      </div>
    );
  }

  // Only collapse to a bare message when there is no way to search. With server
  // search the control must stay mounted, otherwise a zero-result search would
  // unmount the search input and strand the user.
  if (repos.length === 0 && !onSearch && !searching) {
    return <p className="py-2 text-sm text-text-muted">No repositories found for this connection.</p>;
  }

  return (
    <div className={onRefresh ? "flex gap-1.5" : undefined}>
      <Combobox
        value={value}
        onValueChange={onChange}
        options={repos.map(repoOption)}
        placeholder="Select a repository…"
        searchPlaceholder="Search repositories…"
        emptyMessage="No repositories match that term. Try a different one."
        aria-labelledby={labelledBy}
        aria-label="Repository"
        onSearch={onSearch}
        searching={searching}
        footer={(query) => (onSearch && hasMore && !query ? (
          <div className="border-t border-border px-3 py-2 text-xs text-text-muted">
            Showing your most recent repositories — type to search the rest.
          </div>
        ) : null)}
      />
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-input) border border-border bg-card text-text-muted transition-colors hover:border-primary-500/30 hover:text-primary-500 disabled:opacity-50"
          title="Refresh repository list"
        >
          <RefreshCwIcon className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      )}
    </div>
  );
}
