import { Search, X } from "lucide-react";
import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

interface SearchInputProps extends Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
}

/** Shadcn Blocks pattern: Input/Input Types 4 — search with icon + clear */
export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = "Search…",
  className,
  ...props
}: SearchInputProps) {
  const hasValue = value.length > 0;

  return (
    <div className="relative flex items-center">
      <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
      <Input
        type="search"
        role="searchbox"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("pl-9", hasValue ? "pr-9" : undefined, className)}
        {...props}
      />
      {hasValue ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            onClear?.();
          }}
          className="absolute right-2 flex size-7 items-center justify-center rounded-md text-primary/80 transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
