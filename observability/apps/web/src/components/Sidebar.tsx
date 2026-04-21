import {
  Filter,
  Search,
  Activity,
  AlertCircle,
  Info,
  Bug,
  MessageSquare,
  Server,
  Globe,
  Monitor,
} from "lucide-react";
import type { FilterState, LogLevel, LogSource } from "@observability/types";

interface SidebarProps {
  isConnected: boolean;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

const TYPE_OPTIONS: {
  label: string;
  value: LogLevel | null;
  icon: typeof Activity;
  color: string;
}[] = [
  { label: "All", value: null, icon: Activity, color: "text-zinc-400" },
  { label: "Info", value: "info", icon: Info, color: "text-blue-400" },
  { label: "Warn", value: "warn", icon: AlertCircle, color: "text-amber-400" },
  { label: "Error", value: "error", icon: AlertCircle, color: "text-red-400" },
  { label: "Debug", value: "debug", icon: Bug, color: "text-purple-400" },
  { label: "Log", value: "log", icon: MessageSquare, color: "text-zinc-400" },
];

const SOURCE_OPTIONS: {
  label: string;
  value: LogSource | null;
  icon: typeof Activity;
  color: string;
}[] = [
  { label: "All", value: null, icon: Activity, color: "text-zinc-400" },
  { label: "Proxy", value: "proxy", icon: Server, color: "text-cyan-400" },
  { label: "Frontend", value: "frontend", icon: Globe, color: "text-green-400" },
  { label: "Service", value: "service", icon: Monitor, color: "text-orange-400" },
];

export function Sidebar({ isConnected, filters, onFiltersChange }: SidebarProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 z-10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <Filter className="h-4 w-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-300">Filters</span>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {/* Type Filter */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Type
          </label>
          <div className="flex flex-col gap-1">
            {TYPE_OPTIONS.map(({ label, value, icon: Icon, color }) => {
              const isActive = filters.type === value;
              return (
                <button
                  key={label}
                  onClick={() =>
                    onFiltersChange({ ...filters, type: value })
                  }
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${color}`} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Source Filter */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Source
          </label>
          <div className="flex flex-col gap-1">
            {SOURCE_OPTIONS.map(({ label, value, icon: Icon, color }) => {
              const isActive = filters.source === value;
              return (
                <button
                  key={label}
                  onClick={() =>
                    onFiltersChange({ ...filters, source: value })
                  }
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${color}`} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Endpoint Filter */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Endpoint
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="/api/..."
              value={filters.endpoint}
              onChange={(e) =>
                onFiltersChange({ ...filters, endpoint: e.target.value })
              }
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 py-2 pl-8 pr-3 text-sm text-zinc-300 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-600"
            />
          </div>
        </div>

        {/* Text Search */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search logs..."
              value={filters.text}
              onChange={(e) =>
                onFiltersChange({ ...filters, text: e.target.value })
              }
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 py-2 pl-8 pr-3 text-sm text-zinc-300 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-600"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              isConnected ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          <span className="text-xs text-zinc-500">
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>
    </aside>
  );
}
