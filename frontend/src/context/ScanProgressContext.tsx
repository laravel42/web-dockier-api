import { createContext, useContext, type ReactNode } from "react";
import {
  useScanProgressController,
  type ScanProgressContextValue,
} from "./useScanProgressController";
import type { ScanLiveState } from "./scanProgressState";

export type { ScanLiveState } from "./scanProgressState";

const ScanProgressContext = createContext<ScanProgressContextValue | null>(null);

export function ScanProgressProvider({ children }: { children: ReactNode }) {
  const value = useScanProgressController();
  return (
    <ScanProgressContext.Provider value={value}>
      {children}
    </ScanProgressContext.Provider>
  );
}

/** Subscribe to live state for a scan — re-renders when that scan's slice changes. */
export function useScanLiveState(scanId: string | undefined): ScanLiveState | undefined {
  const ctx = useContext(ScanProgressContext);
  if (!ctx) {
    throw new Error("useScanLiveState must be used within ScanProgressProvider");
  }
  return scanId ? ctx.states[scanId] : undefined;
}

export function useScanProgress(): ScanProgressContextValue {
  const ctx = useContext(ScanProgressContext);
  if (!ctx) {
    throw new Error("useScanProgress must be used within ScanProgressProvider");
  }
  return ctx;
}
