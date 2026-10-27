import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import Spinner from "@/components/Spinner";
import { cn } from "@/utils/cn";

/** Debounce before asking the parent to widen the set from the server. */
const SEARCH_DEBOUNCE_MS = 300;

export interface ComboboxOption {
  value: string;
  /** Plain text: the trigger label, and what the search filters on. */
  label: string;
  /** Richer row content (icon, badge). Used in the trigger too. */
  content?: ReactNode;
  disabled?: boolean;
  keywords?: string[];
}

interface ComboboxProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: ReactNode;
  disabled?: boolean;
  className?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  "aria-invalid"?: boolean;
  /** Points at the visible label. Required unless `aria-label` is given. */
  "aria-labelledby"?: string;
  /**
   * Fallback name when there is no visible label to point at. One of the two
   * is mandatory: `role="combobox"` takes its name from a label, never from
   * the trigger's own text, so without either the control is unnamed.
   */
  "aria-label"?: string;
  /** Pinned under the list. Receives the current query. */
  footer?: (query: string) => ReactNode;
  /**
   * Debounced callback with the typed term, so the parent can query the server
   * for options beyond the page it loaded. Local filtering still applies to
   * whatever is in `options`, so typing narrows instantly either way.
   */
  onSearch?: (term: string) => void;
  /** True while a server-side search is in flight. */
  searching?: boolean;
}

/**
 * Searchable single-select.
 *
 * The positioning, dismissal, listbox roles and keyboard come from Radix
 * Popover and cmdk rather than from our own code — an earlier hand-rolled
 * version of all four reimplemented them and got the ARIA wrong.
 */
export function Combobox({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No results found.",
  disabled,
  className,
  allowEmpty,
  emptyLabel = "None",
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledBy,
  "aria-label": ariaLabel,
  footer,
  onSearch,
  searching,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();

  const selected = options.find((option) => option.value === value);
  const selectedLabel = selected?.label ?? (allowEmpty && value === "" ? emptyLabel : undefined);
  const triggerContent = selected?.content ?? (
    selectedLabel !== undefined
      ? <span className="truncate">{selectedLabel}</span>
      : <span className="truncate text-text-muted">{placeholder}</span>
  );

  // Reset the query whenever the popup opens, so a stale term never hides the
  // list a user just opened.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  // Debounced server-side search. The callback is held in a ref so an unstable
  // parent function doesn't restart the timer on every render.
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);
  // Term already reflected in `options` — starts as "" since the parent loads
  // the default page, so simply opening the popup doesn't refetch.
  const lastRequestedRef = useRef("");
  useEffect(() => {
    if (!onSearchRef.current || !open) return;
    const term = query.trim();
    if (lastRequestedRef.current === term) return;
    const timer = setTimeout(() => {
      lastRequestedRef.current = term;
      onSearchRef.current?.(term);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listId}
          aria-labelledby={ariaLabelledBy}
          aria-label={ariaLabelledBy ? undefined : ariaLabel}
          disabled={disabled}
          aria-invalid={ariaInvalid}
          className={cn(
            "flex h-9 w-full cursor-pointer items-center gap-2 rounded-(--radius-input) border border-border bg-card px-3 text-left text-ui transition-colors outline-none",
            "focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "aria-invalid:border-danger-500 aria-invalid:ring-1 aria-invalid:ring-danger-500/20",
            className,
          )}
        >
          {triggerContent}
          <ChevronDownIcon className="ml-auto size-4 shrink-0 text-text-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) gap-0 overflow-hidden rounded-(--radius-input) border border-border bg-card p-0 ring-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList id={listId}>
            {searching && options.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-text-muted">
                <Spinner className="size-4" />
                Searching…
              </div>
            ) : (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            )}
            <CommandGroup>
              {allowEmpty &&
              !options.some((option) => option.value === "") ? (
                <CommandItem
                  value={emptyLabel}
                  onSelect={() => {
                    onValueChange("");
                    setOpen(false);
                  }}
                >
                  {emptyLabel}
                </CommandItem>
              ) : null}
              {options.map((option) => (
                <CommandItem
                  key={option.value || "__empty__"}
                  value={option.label}
                  keywords={option.keywords ?? [option.value]}
                  disabled={option.disabled}
                  className={option.value === value ? "font-medium text-primary-600" : undefined}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.content ?? option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {footer?.(query)}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
