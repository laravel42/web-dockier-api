export interface ScanSocket {
  readonly readyState: number;
  readonly OPEN: number;
  send(data: string): void;
  on(event: "close", listener: () => void): void;
  close(code?: number, reason?: string): void;
}

export type ScanProgressScanner = "cloning" | "semgrep" | "custom" | "sensitive" | "sonarqube" | "persisting";

export interface ScanProgressPayload {
  phase: "cloning" | "scanning" | "persisting" | "done";
  filesScanned: number;
  filesInRepo: number;
  findingsCount: number;
  currentFile?: string;
  currentRule?: string;
  scanner?: ScanProgressScanner;
  rulesChecked?: number;
  rulesTotal?: number;
}

export type ScanWsMessage =
  | { type: "snapshot"; scanId: string; status: string; progress?: ScanProgressPayload; summary: Record<string, unknown> }
  | { type: "progress"; scanId: string; progress: ScanProgressPayload }
  | { type: "status"; scanId: string; status: string; summary: Record<string, unknown> };

const subscribers = new Map<string, Set<ScanSocket>>();

function getSubscriberSet(scanId: string): Set<ScanSocket> {
  let set = subscribers.get(scanId);
  if (!set) {
    set = new Set();
    subscribers.set(scanId, set);
  }
  return set;
}

export function subscribeToScan(scanId: string, socket: ScanSocket): void {
  getSubscriberSet(scanId).add(socket);
}

export function unsubscribeFromScan(scanId: string, socket: ScanSocket): void {
  const set = subscribers.get(scanId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) subscribers.delete(scanId);
}

export function broadcastScanEvent(scanId: string, message: ScanWsMessage): void {
  if (typeof process.send === "function") {
    process.send({ type: "scan-event", scanId, message });
    return;
  }

  const set = subscribers.get(scanId);
  if (!set || set.size === 0) return;

  const payload = JSON.stringify(message);
  for (const socket of set) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

export function sendScanSnapshot(
  socket: ScanSocket,
  scanId: string,
  status: string,
  summary: Record<string, unknown>,
): void {
  if (socket.readyState !== socket.OPEN) return;
  const progress = summary.progress as ScanProgressPayload | undefined;
  const message: ScanWsMessage = {
    type: "snapshot",
    scanId,
    status,
    summary,
    ...(progress ? { progress } : {}),
  };
  socket.send(JSON.stringify(message));
}
