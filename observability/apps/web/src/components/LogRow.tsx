import type { LogEntry, LogLevel } from "@observability/types";
import {
  Info,
  AlertCircle,
  Bug,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";

const TYPE_CONFIG: Record<
  LogLevel,
  { color: string; bgColor: string; icon: React.ComponentType<{ className?: string }> }
> = {
  info: { color: "text-blue-400", bgColor: "bg-blue-500/10", icon: Info },
  warn: { color: "text-amber-400", bgColor: "bg-amber-500/10", icon: AlertTriangle },
  error: { color: "text-red-400", bgColor: "bg-red-500/10", icon: AlertCircle },
  debug: { color: "text-purple-400", bgColor: "bg-purple-500/10", icon: Bug },
  log: { color: "text-zinc-400", bgColor: "bg-zinc-500/10", icon: MessageSquare },
};

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

export interface LogRowProps {
  entry: LogEntry;
  isSelected: boolean;
  isChecked: boolean;
  onClick: (entry: LogEntry) => void;
  onCheckChange: (entryId: string, shiftKey: boolean) => void;
}

export function LogRow({ entry, isSelected, isChecked, onClick, onCheckChange }: LogRowProps) {
  const config = TYPE_CONFIG[entry.type] ?? TYPE_CONFIG.log;
  const Icon = config.icon;

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={() => onClick(entry)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(entry);
        }
      }}
      className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer border-b border-zinc-800/50 transition-colors overflow-hidden ${
        isSelected
          ? "bg-blue-600/15 border-l-2 border-l-blue-500"
          : entry.type === "error"
            ? "bg-red-950/30 border-l-2 border-l-red-500/60 hover:bg-red-950/50"
            : "hover:bg-zinc-800/50 border-l-2 border-l-transparent"
      }`}
    >
      {/* Selection checkbox */}
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => {
          e.stopPropagation();
          onCheckChange(entry.id, e.nativeEvent instanceof MouseEvent && (e.nativeEvent as MouseEvent).shiftKey);
        }}
        onClick={(e) => e.stopPropagation()}
        className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-zinc-600 bg-zinc-800 accent-blue-500"
        aria-label={`Select log entry ${entry.id}`}
      />

      {/* Type badge */}
      <span
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-medium uppercase ${config.color} ${config.bgColor}`}
      >
        <Icon className="h-3 w-3" />
        <span className="w-10 text-center">{entry.type}</span>
      </span>

      {/* Timestamp */}
      <span className="shrink-0 font-mono text-zinc-500">
        {formatTimestamp(entry.timestamp)}
      </span>

      {/* Method + Endpoint */}
      {entry.method && (
        <span className="shrink-0 text-zinc-300">
          <span className="font-semibold">{entry.method}</span>
          {entry.endpoint && (
            <span className="ml-1 text-zinc-500">{entry.endpoint}</span>
          )}
        </span>
      )}

      {/* Message (truncated) */}
      <span className="min-w-0 flex-1 truncate text-zinc-400">
        {entry.message}
      </span>

      {/* Duration badge */}
      {entry.duration !== undefined && (
        <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">
          {entry.duration}ms
        </span>
      )}

      {/* Source badge */}
      <span className="shrink-0 rounded bg-zinc-800/60 px-1.5 py-0.5 text-zinc-500">
        {entry.source}
      </span>

      {/* Group */}
      {entry.group !== "default" && (
        <span className="shrink-0 rounded bg-zinc-800/40 px-1.5 py-0.5 text-zinc-600">
          {entry.group}
        </span>
      )}
    </div>
  );
}
