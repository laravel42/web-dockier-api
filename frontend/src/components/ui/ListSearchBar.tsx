import { SearchIcon } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function ClearIcon() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

const shellCls =
  "input-enlarge-wrap group flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-ui transition-[max-width,border-color,box-shadow] duration-300 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30";

const fieldCls =
  "min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-text outline-none placeholder:text-text-muted";

export default function ListSearchBar({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
}: Props) {
  const hasValue = value.length > 0;

  return (
    <div className={`${shellCls} ${className}`}>
      <SearchIcon className="size-4 shrink-0 text-text-muted transition-colors group-focus-within:text-primary" />
      <input
        type="text"
        role="searchbox"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={fieldCls}
        aria-label={placeholder}
      />
      {hasValue && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-primary/80 transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label="Clear search"
        >
          <ClearIcon />
        </button>
      )}
    </div>
  );
}
