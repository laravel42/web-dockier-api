import { useState, useRef, useEffect } from "react";
import DevIcon from "./DevIcon";

interface Connection {
  id: string;
  provider: string;
  label: string;
}

const PROVIDER_ICONS: Record<string, { icon: string; name: string }> = {
  github: { icon: "github", name: "GitHub" },
  gitlab: { icon: "gitlab", name: "GitLab" },
  gitlab_self_hosted: { icon: "gitlab", name: "GitLab" },
  bitbucket: { icon: "bitbucket", name: "Bitbucket" },
};

interface Props {
  value: string;
  onChange: (id: string) => void;
  connections: Connection[];
  loading?: boolean;
}

export default function SourceControlSelect({ value, onChange, connections, loading }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = connections.find((c) => c.id === value);

  const filtered = connections.filter((c) => {
    const q = search.toLowerCase();
    const provider = PROVIDER_ICONS[c.provider];
    return (
      c.label.toLowerCase().includes(q) ||
      (provider?.name.toLowerCase().includes(q))
    );
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-text-muted">
        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        Loading…
      </div>
    );
  }

  if (connections.length === 0) {
    return <p className="text-sm text-text-muted py-2">No git connections found. Add one in Settings → Git Integration.</p>;
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors flex items-center gap-2 cursor-pointer text-left"
      >
        {selected ? (
          <>
            <DevIcon
              src={PROVIDER_ICONS[selected.provider]?.icon ?? "git"}
              alt=""
              className="w-4 h-4 shrink-0"
            />
            <span className="truncate">{selected.label} ({PROVIDER_ICONS[selected.provider]?.name ?? selected.provider})</span>
          </>
        ) : (
          <span className="text-text-muted">Select a source control…</span>
        )}
        <svg className="w-4 h-4 ml-auto shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-[var(--radius-input)] shadow-lg max-h-64 flex flex-col">
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search connections…"
              className="w-full h-8 px-2 rounded bg-secondary-50 text-text text-sm outline-none focus:ring-1 focus:ring-primary-500/20"
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
                  <DevIcon
                    src={PROVIDER_ICONS[c.provider]?.icon ?? "git"}
                    alt=""
                    className="w-4 h-4 shrink-0"
                  />
                  <span>{c.label} ({PROVIDER_ICONS[c.provider]?.name ?? c.provider})</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
