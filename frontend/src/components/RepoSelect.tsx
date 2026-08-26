import { useState, useRef, useEffect } from "react";
import { useDropdownPosition } from "../hooks/useDropdownPosition";
import DropdownPortal from "./DropdownPortal";
import Spinner from "./Spinner";
import { Input } from "./ui/input";
import type { Repo } from "../types";
import { ArchiveIcon, ChevronDownIcon, LockIcon, RefreshCwIcon } from "lucide-react";

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

/** Debounce delay before hitting the server while the user types. */
const SEARCH_DEBOUNCE_MS = 300;

export default function RepoSelect({ value, onChange, repos, loading, onRefresh, refreshing, labelledBy, onSearch, searching, hasMore }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { triggerRef, pos, updatePos, clearPos } = useDropdownPosition();

  const selected = repos.find((r) => r.fullName === value);
  // Local filter gives instant feedback; the server search (below) then widens
  // the set beyond the loaded page.
  const filtered = repos.filter((r) => r.fullName.toLowerCase().includes(search.toLowerCase()));

  // Debounced server-side search. The callback is held in a ref so an unstable
  // parent function doesn't restart the debounce timer on every render.
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);
  // Term already reflected in `repos` — starts as "" since the parent loads the
  // default page, so simply opening the dropdown doesn't refetch.
  const lastRequestedRef = useRef("");
  useEffect(() => {
    if (!onSearchRef.current || !open) return;
    const term = search.trim();
    if (lastRequestedRef.current === term) return;
    const id = setTimeout(() => {
      lastRequestedRef.current = term;
      onSearchRef.current?.(term);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search, open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      clearPos();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [clearPos, triggerRef]);

  useEffect(() => {
    if (open) {
      setSearch("");
      updatePos();
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      clearPos();
    }
  }, [open, updatePos, clearPos]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-text-muted">
        <Spinner className="size-4 " />
        Loading…
      </div>
    );
  }

  // Only collapse to a bare message when there's no way to search. With search
  // enabled the control must stay mounted, otherwise a zero-result search would
  // unmount the search input and strand the user.
  if (repos.length === 0 && !onSearch && !searching) {
    return <p className="text-sm text-text-muted py-2">No repositories found for this connection.</p>;
  }

  return (
    <div>
      <div className="flex gap-1.5">
      <button
        ref={triggerRef}
        type="button"
        aria-labelledby={labelledBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { if (!open) updatePos(); setOpen(!open); }}
        className="w-full h-9 px-3 rounded-(--radius-input) border border-border bg-card text-ui outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors flex items-center gap-2 cursor-pointer text-left"
      >
        {selected ? (
          <>
            <ArchiveIcon className="size-4 shrink-0 text-text-muted" />
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{selected.fullName}</span>
              {selected.private && (
                <LockIcon className="size-3.5 shrink-0" aria-label="Private" />
              )}
            </div>
          </>
        ) : (
          <span className="text-text-muted">Select a repository…</span>
        )}
        <ChevronDownIcon className="size-4 ml-auto shrink-0 text-text-muted" />
      </button>
      {onRefresh && (
        <button
          type="button"
          onClick={() => {
            // Clear the filter so the refreshed list isn't hidden by a stale term.
            setSearch("");
            lastRequestedRef.current = "";
            onRefresh();
          }}
          disabled={refreshing}
          className="size-9 shrink-0 rounded-(--radius-input) border border-border bg-card flex items-center justify-center text-text-muted hover:text-primary-500 hover:border-primary-500/30 transition-colors disabled:opacity-50"
          title="Refresh repository list"
        >
          <RefreshCwIcon className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      )}
      </div>

      <DropdownPortal open={open} pos={pos} dropdownRef={dropdownRef}>
        <div className="p-2 border-b border-border">
          <Input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search repositories…"
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {searching && filtered.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-text-muted">
              <Spinner className="size-4" />
              Searching…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-text-muted">
              {search
                ? `No repositories match "${search}". Try a different term.`
                : "No repositories found for this connection."}
            </div>
          ) : (
            filtered.map((r) => (
              <button
                key={r.fullName}
                type="button"
                onClick={() => { onChange(r.fullName); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-secondary transition-colors ${
                  value === r.fullName ? "bg-primary/10 text-primary-600" : "text-text"
                }`}
              >
                <ArchiveIcon className="size-4 shrink-0 text-text-muted" />
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{r.fullName}</span>
                  {r.private && (
                    <LockIcon className="size-3.5 shrink-0" aria-label="Private" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>
        {onSearch && hasMore && !search && (
          <div className="border-t border-border px-3 py-2 text-xs text-text-muted">
            Showing your most recent repositories — type to search the rest.
          </div>
        )}
      </DropdownPortal>
    </div>
  );
}
