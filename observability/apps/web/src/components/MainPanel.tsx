import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Editor from "@monaco-editor/react";
import { Activity, X, ChevronRight, ChevronDown, AlertTriangle } from "lucide-react";
import type { LogEntry } from "@observability/types";
import { LogRow } from "./LogRow";
import { groupLogEntries } from "../utils/groupLogs";

export interface MainPanelProps {
  logs: LogEntry[];
  autoScroll: boolean;
  selectedLog: LogEntry | null;
  onSelectLog: (entry: LogEntry | null) => void;
  groupByEnabled?: boolean;
  selectedLogIds: Set<string>;
  onCheckChange: (entryId: string, shiftKey: boolean) => void;
}

const ROW_HEIGHT = 36;
const GROUP_HEADER_HEIGHT = 32;

/** Check if a stringified value contains a truncation marker. */
function hasTruncationMarker(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return str.includes("... [truncated:");
}

type FlatItem =
  | { kind: "entry"; entry: LogEntry }
  | { kind: "group-header"; group: string; count: number; collapsed: boolean };

export function MainPanel({
  logs,
  autoScroll,
  selectedLog,
  onSelectLog,
  groupByEnabled = false,
  selectedLogIds,
  onCheckChange,
}: MainPanelProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const prevLogCountRef = useRef(logs.length);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [detailTab, setDetailTab] = useState<"overview" | "request" | "response">("overview");

  // Build flat list of items (entries or group headers)
  const flatItems: FlatItem[] = useMemo(() => {
    if (!groupByEnabled) {
      return logs.map((entry) => ({ kind: "entry" as const, entry }));
    }

    const groups = groupLogEntries(logs);
    const items: FlatItem[] = [];

    for (const g of groups) {
      const collapsed = collapsedGroups.has(g.group);
      items.push({
        kind: "group-header",
        group: g.group,
        count: g.entries.length,
        collapsed,
      });
      if (!collapsed) {
        for (const entry of g.entries) {
          items.push({ kind: "entry", entry });
        }
      }
    }

    return items;
  }, [logs, groupByEnabled, collapsedGroups]);

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) =>
      flatItems[index].kind === "group-header" ? GROUP_HEADER_HEIGHT : ROW_HEIGHT,
    overscan: 20,
  });

  // Auto-scroll to bottom when new logs arrive and autoScroll is enabled
  useEffect(() => {
    if (autoScroll && logs.length > prevLogCountRef.current && flatItems.length > 0) {
      virtualizer.scrollToIndex(flatItems.length - 1, { align: "end" });
    }
    prevLogCountRef.current = logs.length;
  }, [logs.length, autoScroll, virtualizer, flatItems.length]);

  const handleSelectLog = useCallback(
    (entry: LogEntry) => {
      onSelectLog(selectedLog?.id === entry.id ? null : entry);
    },
    [selectedLog, onSelectLog],
  );

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }, []);

  // Detect truncation in selected log
  const selectedLogTruncated = useMemo(() => {
    if (!selectedLog) return false;
    return hasTruncationMarker(selectedLog.body) || hasTruncationMarker(selectedLog.response);
  }, [selectedLog]);

  return (
    <main className="flex flex-1 flex-col overflow-hidden min-w-0">
      {/* Empty state */}
      {logs.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-zinc-600">
            <Activity className="h-12 w-12 stroke-1" />
            <p className="text-sm">Waiting for log entries...</p>
            <p className="text-xs text-zinc-700">
              Connect to the proxy server to start streaming logs
            </p>
          </div>
        </div>
      )}

      {/* Log list area — hidden when empty */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto min-h-0"
        role="grid"
        aria-label="Log entries"
        hidden={logs.length === 0}
      >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = flatItems[virtualRow.index];

              if (item.kind === "group-header") {
                return (
                  <div
                    key={`group-${item.group}`}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <button
                      onClick={() => toggleGroup(item.group)}
                      className="flex w-full items-center gap-2 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 border-b border-zinc-800 hover:bg-zinc-800/70 transition-colors"
                      aria-expanded={!item.collapsed}
                    >
                      {item.collapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                      )}
                      <span className="text-zinc-400">Group:</span>
                      <span>{item.group}</span>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-500">
                        {item.count}
                      </span>
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={item.entry.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <LogRow
                    entry={item.entry}
                    isSelected={selectedLog?.id === item.entry.id}
                    isChecked={selectedLogIds.has(item.entry.id)}
                    onClick={handleSelectLog}
                    onCheckChange={onCheckChange}
                  />
                </div>
              );
            })}
          </div>
        </div>

      {/* Detail panel — Tabbed view */}
      {selectedLog && (
        <div className="flex flex-col border-t border-zinc-800 bg-zinc-900/50" style={{ height: 300 }}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {(["overview", "request", "response"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setDetailTab(tab)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      detailTab === tab
                        ? "bg-zinc-800 text-zinc-200"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              {selectedLogTruncated && (
                <span className="flex items-center gap-1 rounded bg-amber-600/20 px-2 py-0.5 text-xs text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  Truncated
                </span>
              )}
            </div>
            <button
              onClick={() => onSelectLog(null)}
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              aria-label="Close detail panel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              language="json"
              theme="vs-dark"
              value={
                detailTab === "request"
                  ? JSON.stringify(
                      {
                        url: selectedLog.endpoint ?? null,
                        method: selectedLog.method ?? null,
                        headers: selectedLog.requestHeaders ?? {},
                        query: selectedLog.query ?? null,
                        body: selectedLog.body ?? null,
                      },
                      null,
                      2,
                    )
                  : detailTab === "response"
                    ? JSON.stringify(
                        {
                          status: selectedLog.status ?? null,
                          headers: selectedLog.responseHeaders ?? {},
                          body: (() => {
                            try {
                              return typeof selectedLog.response === "string"
                                ? JSON.parse(selectedLog.response)
                                : selectedLog.response ?? null;
                            } catch {
                              return selectedLog.response ?? null;
                            }
                          })(),
                        },
                        null,
                        2,
                      )
                    : JSON.stringify(selectedLog, null, 2)
              }
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 12,
                lineNumbers: "on",
                wordWrap: "on",
                folding: true,
                automaticLayout: true,
              }}
            />
          </div>
        </div>
      )}

      {/* Collapsed detail hint when no log is selected */}
      {!selectedLog && logs.length > 0 && (
        <div className="border-t border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-xs text-zinc-500">Log Detail</span>
            <span className="text-xs text-zinc-600">
              Select a log entry to view details
            </span>
          </div>
        </div>
      )}
    </main>
  );
}
