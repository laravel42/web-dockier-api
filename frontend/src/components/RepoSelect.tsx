import { useState, useRef, useEffect } from "react";
import { useDropdownPosition } from "../hooks/useDropdownPosition";
import DropdownPortal from "./DropdownPortal";
import Spinner from "./Spinner";
import { Input } from "./ui/input";
import type { Repo } from "../types";
import { ArchiveIcon, ChevronDownIcon, RefreshCwIcon } from "lucide-react";

interface Props {
  value: string;
  onChange: (fullName: string) => void;
  repos: Repo[];
  loading?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export default function RepoSelect({ value, onChange, repos, loading, onRefresh, refreshing }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { triggerRef, pos, updatePos, clearPos } = useDropdownPosition();

  const selected = repos.find((r) => r.fullName === value);
  const filtered = repos.filter((r) => r.fullName.toLowerCase().includes(search.toLowerCase()));

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

  if (repos.length === 0) {
    return <p className="text-sm text-text-muted py-2">No repositories found for this connection.</p>;
  }

  return (
    <div>
      <div className="flex gap-1.5">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { if (!open) updatePos(); setOpen(!open); }}
        className="w-full h-9 px-3 rounded-(--radius-input) border border-border bg-card text-ui outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors flex items-center gap-2 cursor-pointer text-left"
      >
        {selected ? (
          <>
            <ArchiveIcon className="size-4 shrink-0 text-text-muted" />
            <span className="truncate">{selected.fullName}{selected.private ? " 🔒" : ""}</span>
          </>
        ) : (
          <span className="text-text-muted">Select a repository…</span>
        )}
        <ChevronDownIcon className="size-4 ml-auto shrink-0 text-text-muted" />
      </button>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="size-11  shrink-0 rounded-(--radius-input) border border-border bg-card flex items-center justify-center text-text-muted hover:text-primary-500 hover:border-primary-500/30 transition-colors disabled:opacity-50"
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
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-text-muted text-center">No repositories found</div>
          ) : (
            filtered.map((r) => (
              <button
                key={r.fullName}
                type="button"
                onClick={() => { onChange(r.fullName); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-secondary-50 transition-colors ${
                  value === r.fullName ? "bg-primary-50 text-primary-600" : "text-text"
                }`}
              >
                <ArchiveIcon className="size-4 shrink-0 text-text-muted" />
                <span>{r.fullName}{r.private ? " 🔒" : ""}</span>
              </button>
            ))
          )}
        </div>
      </DropdownPortal>
    </div>
  );
}
