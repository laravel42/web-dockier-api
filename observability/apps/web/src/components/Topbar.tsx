import {
  Pause,
  Play,
  Trash2,
  ArrowDownToLine,
  Download,
  Send,
  Layers,
} from "lucide-react";

export interface TopbarProps {
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  logCount: number;
  totalCount?: number;
  onExport?: () => void;
  groupByEnabled?: boolean;
  onToggleGroupBy?: () => void;
  selectedCount: number;
  onSendToKiro: () => void;
  isSending: boolean;
}

export function Topbar({
  isPaused,
  onPause,
  onResume,
  onClear,
  autoScroll,
  onToggleAutoScroll,
  logCount,
  totalCount,
  onExport,
  groupByEnabled,
  onToggleGroupBy,
  selectedCount,
  onSendToKiro,
  isSending,
}: TopbarProps) {
  const sendEnabled = selectedCount > 0 && !isSending;

  return (
    <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-2">
      {/* Left: Title */}
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-zinc-200">
          Observability Dashboard
        </h1>
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
          {totalCount !== undefined && totalCount !== logCount
            ? `${logCount} / ${totalCount} logs`
            : `${logCount} ${logCount === 1 ? "log" : "logs"}`}
        </span>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onPause}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
            isPaused
              ? "bg-amber-600/20 text-amber-400"
              : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          }`}
          title="Pause"
          aria-pressed={isPaused}
        >
          <Pause className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Pause</span>
        </button>

        <button
          onClick={onResume}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
            !isPaused
              ? "bg-green-600/20 text-green-400"
              : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          }`}
          title="Resume"
          aria-pressed={!isPaused}
        >
          <Play className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Resume</span>
        </button>

        <button
          onClick={onClear}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          title="Clear"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Clear</span>
        </button>

        <div className="mx-1 h-4 w-px bg-zinc-800" />

        <button
          onClick={onToggleAutoScroll}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
            autoScroll
              ? "bg-blue-600/20 text-blue-400"
              : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          }`}
          title="Auto-scroll"
          aria-pressed={autoScroll}
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Auto-scroll</span>
        </button>

        <div className="mx-1 h-4 w-px bg-zinc-800" />

        <button
          onClick={onExport}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          title="Export"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Export</span>
        </button>

        <button
          onClick={onToggleGroupBy}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
            groupByEnabled
              ? "bg-violet-600/20 text-violet-400"
              : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          }`}
          title="Group by"
          aria-pressed={groupByEnabled}
        >
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Group</span>
        </button>

        <button
          onClick={sendEnabled ? onSendToKiro : undefined}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
            sendEnabled
              ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 hover:text-blue-300"
              : "bg-blue-600/20 text-blue-400 cursor-not-allowed opacity-50"
          }`}
          title="Send to Kiro"
          disabled={!sendEnabled}
        >
          <Send className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {isSending
              ? "Sending…"
              : selectedCount > 0
                ? `Send ${selectedCount} to Kiro`
                : "Send to Kiro"}
          </span>
        </button>
      </div>
    </header>
  );
}
