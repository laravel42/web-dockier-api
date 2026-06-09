const API_BASE = import.meta.env.VITE_API_BASE || "";

export function getScanWebSocketUrl(scanId: string, token: string): string {
  const base = API_BASE
    ? API_BASE.replace(/^http/i, "ws")
    : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:4000`;
  const qs = new URLSearchParams({ token });
  return `${base}/code-analysis/scans/${scanId}/ws?${qs.toString()}`;
}

export type ScanWsMessage =
  | {
      type: "snapshot";
      scanId: string;
      status: string;
      progress?: {
        phase: string;
        filesScanned: number;
        filesInRepo: number;
        findingsCount: number;
        currentFile?: string;
        currentRule?: string;
        scanner?: string;
        rulesChecked?: number;
        rulesTotal?: number;
      };
      summary: Record<string, unknown>;
    }
  | {
      type: "progress";
      scanId: string;
      progress: {
        phase: string;
        filesScanned: number;
        filesInRepo: number;
        findingsCount: number;
        currentFile?: string;
        currentRule?: string;
        scanner?: string;
        rulesChecked?: number;
        rulesTotal?: number;
      };
    }
  | {
      type: "status";
      scanId: string;
      status: string;
      summary: Record<string, unknown>;
    };
