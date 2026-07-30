import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useDropdownPosition } from "../hooks/useDropdownPosition";
import Spinner from "./Spinner";
import type { Repo } from "../types";

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
            <svg xmlns="http://www.w3.org/2000/svg" className="size-4  shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
            <span className="truncate">{selected.fullName}{selected.private ? " 🔒" : ""}</span>
          </>
        ) : (
          <span className="text-text-muted">Select a repository…</span>
        )}
        <svg className="size-4  ml-auto shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="size-11  shrink-0 rounded-(--radius-input) border border-border bg-card flex items-center justify-center text-text-muted hover:text-primary-500 hover:border-primary-500/30 transition-colors disabled:opacity-50"
          title="Refresh repository list"
        >
          <svg className={`size-4  ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
          </svg>
        </button>
      )}
      </div>

      {open && pos && createPortal(
        <div
          ref={dropdownRef}
          className="bg-card border border-border rounded-(--radius-input) shadow-lg max-h-64 flex flex-col"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
        >
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repositories…"
              className="w-full h-8 px-2 rounded bg-secondary-50 text-text text-sm outline-none focus:ring-1 focus:ring-primary-500/20"
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
                  <svg xmlns="http://www.w3.org/2000/svg" className="size-4  shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                  <span>{r.fullName}{r.private ? " 🔒" : ""}</span>
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
