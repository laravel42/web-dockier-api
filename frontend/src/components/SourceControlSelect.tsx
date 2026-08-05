import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useDropdownPosition } from "../hooks/useDropdownPosition";
import SourceControlBadge, { getSourceControl } from "./SourceControlBadge";
import Spinner from "./Spinner";
import type { Connection } from "../types";
import { Input } from "./ui/input";
import { ChevronDownIcon } from "lucide-react";

interface Props {
  value: string;
  onChange: (id: string) => void;
  connections: Connection[];
  loading?: boolean;
}

export default function SourceControlSelect({ value, onChange, connections, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { triggerRef, pos, updatePos, clearPos } = useDropdownPosition();

  const selected = connections.find((c) => c.id === value);

  const filtered = connections.filter((c) => {
    const q = search.toLowerCase();
    const provider = getSourceControl(c.provider);
    return c.label.toLowerCase().includes(q) || provider?.name.toLowerCase().includes(q);
  });

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

  if (connections.length === 0) {
    return <p className="text-sm text-text-muted py-2">No git connections found. Add one in Settings → Git Integration.</p>;
  }

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { if (!open) updatePos(); setOpen(!open); }}
        className="w-full h-9 px-3 rounded-(--radius-input) border border-border bg-card text-ui outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors flex items-center gap-2 cursor-pointer text-left"
      >
        {selected ? (
          <>
            <SourceControlBadge provider={selected.provider} showName={false} />
            <span className="truncate">{selected.label} ({getSourceControl(selected.provider).name})</span>
          </>
        ) : (
          <span className="text-text-muted">Select a source control…</span>
        )}
        <ChevronDownIcon className="size-4 ml-auto shrink-0 text-text-muted" />
      </button>

      {open && pos && createPortal(
        <div
          ref={dropdownRef}
          className="bg-card border border-border rounded-(--radius-input) shadow-lg max-h-64 flex flex-col"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
        >
          <div className="p-2 border-b border-border">
            <Input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search connections…"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-text-muted text-center">No connections found</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { onChange(c.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-secondary-50 transition-colors ${
                    value === c.id ? "bg-primary-50 text-primary-600" : "text-text"
                  }`}
                >
                  <SourceControlBadge provider={c.provider} showName={false} />
                  <span>{c.label} ({getSourceControl(c.provider).name})</span>
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
