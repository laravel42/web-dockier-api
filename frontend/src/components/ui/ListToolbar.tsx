import type { ReactNode } from "react";
import ListSearchBar from "./ListSearchBar";
import ViewModeToggle, { type ViewMode } from "./ViewModeToggle";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  trailing?: ReactNode;
}

export default function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  viewMode,
  onViewModeChange,
  trailing,
}: Props) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <ListSearchBar value={search} onChange={onSearchChange} placeholder={searchPlaceholder} />
      <div className="flex items-center gap-2 shrink-0">
        {viewMode && onViewModeChange && (
          <ViewModeToggle mode={viewMode} onChange={onViewModeChange} />
        )}
        {trailing}
      </div>
    </div>
  );
}
