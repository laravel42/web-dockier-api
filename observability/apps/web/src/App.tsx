import { useState, useMemo, useCallback, useRef } from "react";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { MainPanel } from "./components/MainPanel";
import { ToastContainer, type ToastData } from "./components/Toast";
import { useLogStream } from "./hooks/useLogStream";
import { useSendToKiro } from "./hooks/useSendToKiro";
import { filterLogs } from "./utils/filter";
import { downloadJson } from "./utils/downloadJson";
import type { LogEntry, FilterState } from "@observability/types";

const INITIAL_FILTERS: FilterState = {
  type: null,
  source: null,
  endpoint: "",
  text: "",
};

let toastIdCounter = 0;

export function App() {
  const { logs, isPaused, isConnected, pause, resume, clear } = useLogStream(
    "ws://localhost:3000/logs"
  );
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [groupByEnabled, setGroupByEnabled] = useState(false);

  // Multi-selection state
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
  const lastClickedIndexRef = useRef<number | null>(null);

  // Toast state
  const [toasts, setToasts] = useState<ToastData[]>([]);

  // Send to Kiro hook
  const { sendToKiro, isSending } = useSendToKiro();

  const filteredLogs = useMemo(() => filterLogs(logs, filters), [logs, filters]);

  const addToast = useCallback((type: "success" | "error", message: string) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleExport = useCallback(() => {
    downloadJson(filteredLogs);
  }, [filteredLogs]);

  const handleToggleGroupBy = useCallback(() => {
    setGroupByEnabled((prev) => !prev);
  }, []);

  const handleCheckChange = useCallback(
    (entryId: string, shiftKey: boolean) => {
      setSelectedLogIds((prev) => {
        const next = new Set(prev);
        const currentIndex = filteredLogs.findIndex((l) => l.id === entryId);

        if (shiftKey && lastClickedIndexRef.current !== null) {
          // Shift-click: select range between last clicked and current
          const start = Math.min(lastClickedIndexRef.current, currentIndex);
          const end = Math.max(lastClickedIndexRef.current, currentIndex);
          for (let i = start; i <= end; i++) {
            next.add(filteredLogs[i].id);
          }
        } else {
          // Toggle single entry
          if (next.has(entryId)) {
            next.delete(entryId);
          } else {
            next.add(entryId);
          }
        }

        lastClickedIndexRef.current = currentIndex;
        return next;
      });
    },
    [filteredLogs],
  );

  const handleSendToKiro = useCallback(async () => {
    const selectedEntries = filteredLogs.filter((l) => selectedLogIds.has(l.id));
    if (selectedEntries.length === 0) return;

    try {
      const filePath = await sendToKiro(selectedEntries);
      addToast("success", `Sent ${selectedEntries.length} ${selectedEntries.length === 1 ? "entry" : "entries"} to Kiro → ${filePath}`);
      setSelectedLogIds(new Set());
    } catch (err) {
      addToast("error", `Failed to send to Kiro: ${(err as Error).message}`);
    }
  }, [filteredLogs, selectedLogIds, sendToKiro, addToast]);

  const handleClear = useCallback(() => {
    clear();
    setSelectedLogIds(new Set());
    setSelectedLog(null);
    lastClickedIndexRef.current = null;
  }, [clear]);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar — filter controls */}
      <Sidebar
        isConnected={isConnected}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Topbar — action buttons */}
        <Topbar
          isPaused={isPaused}
          onPause={pause}
          onResume={resume}
          onClear={handleClear}
          autoScroll={autoScroll}
          onToggleAutoScroll={() => setAutoScroll((prev) => !prev)}
          logCount={filteredLogs.length}
          totalCount={logs.length}
          onExport={handleExport}
          groupByEnabled={groupByEnabled}
          onToggleGroupBy={handleToggleGroupBy}
          selectedCount={selectedLogIds.size}
          onSendToKiro={handleSendToKiro}
          isSending={isSending}
        />

        {/* Main panel — log viewer */}
        <MainPanel
          logs={filteredLogs}
          autoScroll={autoScroll}
          selectedLog={selectedLog}
          onSelectLog={setSelectedLog}
          groupByEnabled={groupByEnabled}
          selectedLogIds={selectedLogIds}
          onCheckChange={handleCheckChange}
        />
      </div>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
