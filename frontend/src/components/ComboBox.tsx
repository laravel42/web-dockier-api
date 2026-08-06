import { useState, useRef, useEffect } from "react";
import { useDropdownPosition } from "../hooks/useDropdownPosition";
import DropdownPortal from "./DropdownPortal";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  emptyLabel?: string;
}

export default function ComboBox({ value, onChange, options, placeholder = "Select…", emptyLabel = "No results" }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { triggerRef, pos, updatePos, clearPos } = useDropdownPosition();

  const selected = options.find(o => o.value === value);
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

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

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { if (!open) { setSearch(""); updatePos(); } setOpen(!open); }}
        className="w-full h-9 px-3 rounded-(--radius-input) border border-border bg-card text-ui outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors flex items-center gap-2 cursor-pointer text-left"
      >
        <span className={selected ? "truncate" : "text-text-muted truncate"}>{selected ? selected.label : placeholder}</span>
        <svg className="size-4  ml-auto shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      <DropdownPortal open={open} pos={pos} dropdownRef={dropdownRef}>
        <div className="p-2 border-b border-border">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full h-8 px-2 rounded bg-secondary-50 text-text text-sm outline-none focus:ring-1 focus:ring-primary-500/20"
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-text-muted text-center">{emptyLabel}</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full flex items-center px-3 py-2 text-sm text-left hover:bg-primary/10 transition-colors ${
                  value === o.value ? "text-primary-600 font-medium" : "text-text"
                }`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      </DropdownPortal>
    </div>
  );
}
