import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useDropdownPosition } from "@/hooks/useDropdownPosition";
import DropdownPortal from "@/components/DropdownPortal";
import Spinner from "@/components/Spinner";
import { Input } from "@/components/ui/input";
import { ChevronDownIcon } from "lucide-react";

/** Debounce before asking the parent to widen the set from the server. */
const SEARCH_DEBOUNCE_MS = 300;

export interface SearchSelectProps<T> {
  value: string;
  onChange: (value: string) => void;
  items: T[];
  /** Option value for an item — what `value` is compared against. */
  getValue: (item: T) => string;
  /** Row content. The trigger reuses it to render the selected item. */
  renderItem: (item: T) => ReactNode;
  /** Match against the typed query, already trimmed and lower-cased. */
  matches: (item: T, query: string) => boolean;
  /** Trigger text when nothing is selected. */
  placeholder: string;
  /** Accessible name for the listbox, e.g. "Repositories". */
  listLabel: string;
  searchPlaceholder: string;
  /** id of the visible <label> that names this control. */
  labelledBy?: string;
  /** Replaces the whole control while the first load is in flight. */
  loading?: boolean;
  loadingLabel?: string;
  /** Replaces the whole control when there is nothing to pick. */
  emptyMessage?: ReactNode;
  /** Shown inside the open list when the query matches nothing. */
  noMatchLabel?: (query: string) => ReactNode;
  /** Rendered to the right of the trigger, e.g. a refresh button. */
  adornment?: ReactNode;
  /** Pinned under the list. Receives the current query. */
  footer?: (query: string) => ReactNode;
  /** Debounced server-side search. Omit to keep filtering purely local. */
  onSearch?: (term: string) => void;
  /** True while a server-side search is in flight. */
  searching?: boolean;
}

/**
 * Searchable single-select.
 *
 * Four components (repository, branch, source control, generic combo box) were
 * the same control with a different row renderer: the same portal positioning,
 * the same outside-click close, the same trigger, the same filter. All four
 * also promised `aria-haspopup="listbox"` while offering no listbox, no
 * options, and no keyboard at all — a screen-reader user was told "listbox"
 * and handed a pile of buttons.
 *
 * The keyboard follows the WAI-ARIA combobox-with-listbox-popup pattern rather
 * than the menu pattern in `useMenuKeyboard`: focus stays in the search input
 * so typing keeps working, and the active option is tracked with
 * `aria-activedescendant` instead of real DOM focus.
 */
export default function SearchSelect<T>({
  value,
  onChange,
  items,
  getValue,
  renderItem,
  matches,
  placeholder,
  listLabel,
  searchPlaceholder,
  labelledBy,
  loading,
  loadingLabel = "Loading…",
  emptyMessage,
  noMatchLabel,
  adornment,
  footer,
  onSearch,
  searching,
}: SearchSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { triggerRef, pos, updatePos, clearPos } = useDropdownPosition();
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  const selected = items.find((item) => getValue(item) === value);
  const normalized = query.trim().toLowerCase();
  // Local filter gives instant feedback; a server search (below) then widens
  // the set beyond the page the parent loaded.
  const filtered = normalized ? items.filter((item) => matches(item, normalized)) : items;

  const close = useCallback(() => {
    setOpen(false);
    clearPos();
  }, [clearPos]);

  useEffect(() => {
    if (!open) {
      clearPos();
      return;
    }
    setQuery("");
    setActiveIndex(0);
    updatePos();
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, updatePos, clearPos]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close, triggerRef]);

  // Debounced server-side search. The callback is held in a ref so an unstable
  // parent function doesn't restart the debounce timer on every render.
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);
  // Term already reflected in `items` — starts as "" since the parent loads the
  // default page, so simply opening the dropdown doesn't refetch.
  const lastRequestedRef = useRef("");
  useEffect(() => {
    if (!onSearchRef.current || !open) return;
    const term = query.trim();
    if (lastRequestedRef.current === term) return;
    const id = setTimeout(() => {
      lastRequestedRef.current = term;
      onSearchRef.current?.(term);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query, open]);

  // A narrowed list can be shorter than the active index.
  useEffect(() => setActiveIndex(0), [normalized]);

  // Keep the keyboard-active option visible without moving focus off the input.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const selectAt = (index: number) => {
    const item = filtered[index];
    if (!item) return;
    onChange(getValue(item));
    close();
    triggerRef.current?.focus();
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const last = filtered.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (last < 0 ? 0 : i >= last ? 0 : i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (last < 0 ? 0 : i <= 0 ? last : i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(Math.max(0, last));
        break;
      case "Enter":
        e.preventDefault();
        selectAt(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        close();
        triggerRef.current?.focus();
        break;
      case "Tab":
        close();
        break;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-text-muted">
        <Spinner className="size-4" />
        {loadingLabel}
      </div>
    );
  }

  // Only collapse to a bare message when there is no way to search. With server
  // search the control must stay mounted, otherwise a zero-result search would
  // unmount the search input and strand the user.
  if (items.length === 0 && emptyMessage && !onSearch && !searching) {
    return <p className="py-2 text-sm text-text-muted">{emptyMessage}</p>;
  }

  return (
    <div>
      <div className={adornment ? "flex gap-1.5" : undefined}>
        <button
          ref={triggerRef}
          type="button"
          aria-labelledby={labelledBy}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => setOpen((prev) => !prev)}
          className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-(--radius-input) border border-border bg-card px-3 text-left text-ui outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
        >
          {selected ? renderItem(selected) : <span className="truncate text-text-muted">{placeholder}</span>}
          <ChevronDownIcon className="ml-auto size-4 shrink-0 text-text-muted" />
        </button>
        {adornment}
      </div>
      <DropdownPortal open={open} pos={pos} dropdownRef={dropdownRef}>
        <div className="border-b border-border p-2">
          <Input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={true}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={filtered.length > 0 ? optionId(activeIndex) : undefined}
            aria-label={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={searchPlaceholder}
          />
        </div>
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={listLabel}
          className="flex-1 overflow-y-auto"
        >
          {searching && filtered.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-text-muted">
              <Spinner className="size-4" />
              Searching…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-text-muted">
              {noMatchLabel ? noMatchLabel(query) : "No results"}
            </div>
          ) : (
            filtered.map((item, index) => {
              const itemValue = getValue(item);
              const isSelected = itemValue === value;
              const isActive = index === activeIndex;
              return (
                // Options are not tab stops by design: focus stays in the
                // search input, which carries the keyboard handler, and
                // `aria-activedescendant` points here. The a11y rule cannot
                // model that indirection and wants a listener on the option.
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                <div
                  key={itemValue}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  data-active={isActive}
                  onClick={() => selectAt(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    isActive ? "bg-muted" : ""
                  } ${isSelected ? "font-medium text-primary-600" : "text-text"}`}
                >
                  {renderItem(item)}
                </div>
              );
            })
          )}
        </div>
        {footer?.(query)}
      </DropdownPortal>
    </div>
  );
}
