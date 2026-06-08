import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useDropdownPosition } from "../hooks/useDropdownPosition";
import Spinner from "./Spinner";

interface Props {
  value: string;
  onChange: (branch: string) => void;
  branches: string[];
  loading?: boolean;
}

export default function BranchSelect({ value, onChange, branches, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { triggerRef, pos, updatePos, clearPos } = useDropdownPosition();

  const filtered = branches.filter((b) => b.toLowerCase().includes(search.toLowerCase()));

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

  if (branches.length === 0) {
    return <p className="text-sm text-text-muted py-2">No branches found.</p>;
  }

  const branchIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="size-4  shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  );

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { if (!open) { setSearch(""); updatePos(); } setOpen(!open); }}
        className="w-full h-11 px-3 rounded-(--radius-input) border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors flex items-center gap-2 cursor-pointer text-left"
      >
        {value ? (
          <>
            {branchIcon}
            <span className="truncate">{value}</span>
          </>
        ) : (
          <span className="text-text-muted">Select a branch…</span>
        )}
        <svg className="size-4  ml-auto shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

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
              placeholder="Search branches…"
              className="w-full h-8 px-2 rounded bg-secondary-50 text-text text-sm outline-none focus:ring-1 focus:ring-primary-500/20"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-text-muted text-center">No branches found</div>
            ) : (
              filtered.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => { onChange(b); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-secondary-50 transition-colors ${
                    value === b ? "bg-primary-50 text-primary-600" : "text-text"
                  }`}
                >
                  {branchIcon}
                  <span>{b}</span>
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
