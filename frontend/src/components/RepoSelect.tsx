import SearchSelect from "./ui/SearchSelect";
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

export default function RepoSelect({ value, onChange, repos, loading, onRefresh, refreshing, labelledBy, onSearch, searching, hasMore }: Props) {
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      items={repos}
      getValue={(r) => r.fullName}
      renderItem={(r) => (
        <>
          <ArchiveIcon className="size-4 shrink-0 text-text-muted" />
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{r.fullName}</span>
            {r.private && <LockIcon className="size-3.5 shrink-0" aria-label="Private" />}
          </div>
        </>
      )}
      matches={(r, q) => r.fullName.toLowerCase().includes(q)}
      placeholder="Select a repository…"
      listLabel="Repositories"
      searchPlaceholder="Search repositories…"
      labelledBy={labelledBy}
      loading={loading}
      loadingLabel="Loading…"
      emptyMessage="No repositories found for this connection."
      noMatchLabel={(query) =>
        query
          ? `No repositories match "${query}". Try a different term.`
          : "No repositories found for this connection."
      }
      onSearch={onSearch}
      searching={searching}
      adornment={onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-input) border border-border bg-card text-text-muted transition-colors hover:border-primary-500/30 hover:text-primary-500 disabled:opacity-50"
          title="Refresh repository list"
        >
          <RefreshCwIcon className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      ) : undefined}
      footer={(query) => (onSearch && hasMore && !query ? (
        <div className="border-t border-border px-3 py-2 text-xs text-text-muted">
          Showing your most recent repositories — type to search the rest.
        </div>
      ) : null)}
    />
  );
}
