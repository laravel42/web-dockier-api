import SeverityBadge from "../../../components/SeverityBadge";
import { cardCls } from "../../../utils/styles";
import type { Scan, Finding, ScanProgress } from "../types";

interface Props {
  scanId: string | undefined;
  allScans: Scan[];
  allScansLoading: boolean;
  findings: Finding[];
  scanRunning: boolean;
  scanProgress: ScanProgress | null;
  scanError: string;
  hasConnectionId: boolean;
  onRunScan: () => void;
  onSelectScan: (id: string) => void;
}

export default function ScanSidebar({
  scanId, allScans, allScansLoading, findings,
  scanRunning, scanProgress, scanError,
  hasConnectionId, onRunScan, onSelectScan,
}: Props) {
  return (
    <div className="w-80 shrink-0">
      <div className="sticky top-6 space-y-3">
        <button
          type="button"
          onClick={onRunScan}
          disabled={scanRunning || !hasConnectionId}
          className="w-full h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
        >
          {scanRunning ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Scanning…
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              Run new scan
            </>
          )}
        </button>

        {/* Progress bar */}
        {scanRunning && scanProgress && (() => {
          const pct = scanProgress.phase === "cloning" ? 5
            : scanProgress.phase === "scanning" ? (scanProgress.filesInRepo > 0 ? 10 + Math.round((scanProgress.filesScanned / scanProgress.filesInRepo) * 50) : 30)
            : scanProgress.phase === "persisting" ? (scanProgress.filesInRepo > 0 ? 60 + Math.round((scanProgress.filesScanned / scanProgress.filesInRepo) * 35) : 80)
            : 100;
          const label = scanProgress.phase === "cloning" ? "Cloning repository…"
            : scanProgress.phase === "scanning" ? "Running security scanners…"
            : scanProgress.phase === "persisting" ? "Processing findings…"
            : "Finalizing…";
          return (
            <div className={`${cardCls} p-3 space-y-2`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-text">{label}</p>
                <span className="text-xs font-semibold text-primary-500">{pct}%</span>
              </div>
              <div className="w-full h-1.5 bg-secondary-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between text-[10px] text-text-muted">
                <span>{scanProgress.filesScanned > 0 ? `${scanProgress.filesScanned}/${scanProgress.filesInRepo} files` : ""}</span>
                <span>{scanProgress.findingsCount > 0 ? `${scanProgress.findingsCount} findings` : ""}</span>
              </div>
              {scanProgress.currentFile && (
                <p className="text-[10px] text-text-muted font-mono truncate">{scanProgress.currentFile}</p>
              )}
            </div>
          );
        })()}

        {scanError && (
          <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-xs text-danger-500">{scanError}</div>
        )}

        {/* Scan history */}
        <div className={`${cardCls} overflow-hidden`}>
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Scan History</p>
          </div>
          {allScansLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : allScans.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">No scans yet</p>
          ) : (
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto divide-y divide-border">
              {allScans.map((s) => {
                const isActive = s.id === scanId;
                const statusDot = s.status === "completed" ? "bg-success-500" : s.status === "failed" ? "bg-danger-500" : s.status === "running" ? "bg-primary-500" : "bg-secondary-300";
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelectScan(s.id)}
                    className={`w-full text-left px-3 py-3 transition-colors ${isActive ? "bg-primary-50" : "hover:bg-secondary-50"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
                      <span className={`text-sm font-medium truncate ${isActive ? "text-primary-600" : "text-text"}`}>
                        {new Date(s.createdAt).toLocaleDateString()} {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {s.summary?.totalFindings != null && s.summary.totalFindings > 0 && (() => {
                        if (isActive && findings.length > 0) {
                          const hasOg = findings.some(f => !f.ruleId.startsWith("sonar.") && !f.ruleId.startsWith("custom."));
                          const hasSq = findings.some(f => f.ruleId.startsWith("sonar."));
                          const hasCr = findings.some(f => f.ruleId.startsWith("custom."));
                          return (
                            <div className="flex items-center gap-2 ml-auto shrink-0">
                              {hasOg && <img src="/devicons/semgrep.svg" alt="Semgrep" className="w-4 h-4 rounded" />}
                              {hasSq && <img src="/devicons/sonarqube.svg" alt="SonarQube" className="w-4 h-4 rounded" />}
                              {hasCr && <img src="/logo.png" alt="Custom" className="w-4 h-4 rounded" />}
                            </div>
                          );
                        }
                        return (
                          <div className="flex items-center gap-2 ml-auto shrink-0">
                            <img src="/devicons/semgrep.svg" alt="Semgrep" className="w-4 h-4 rounded" />
                            <img src="/devicons/sonarqube.svg" alt="SonarQube" className="w-4 h-4 rounded" />
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 ml-[18px]">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-text shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                      </svg>
                      <span className="text-xs text-text font-semibold font-mono truncate">{s.branch}</span>
                    </div>
                    {s.commitSha && (
                      <div className="flex items-center gap-2 mt-1 ml-[18px]">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-text shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                        </svg>
                        <span className="text-xs text-text font-semibold font-mono">{s.commitSha.slice(0, 7)}</span>
                        {s.commitMessage && <span className="text-xs text-text-muted truncate">{s.commitMessage.split("\n")[0]}</span>}
                      </div>
                    )}
                    {isActive && findings.length > 0 && (() => {
                      const errs = findings.filter(f => f.severity === "error").length;
                      const warns = findings.filter(f => f.severity === "warning").length;
                      const infos = findings.filter(f => f.severity === "info").length;
                      return (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 ml-[18px]">
                          {errs > 0 && <SeverityBadge severity="error" count={errs} />}
                          {warns > 0 && <SeverityBadge severity="warning" count={warns} />}
                          {infos > 0 && <SeverityBadge severity="info" count={infos} />}
                        </div>
                      );
                    })()}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
