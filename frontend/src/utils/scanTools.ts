/** Engines a scan runs, per browser. Settings and the scan page share this so they cannot disagree. */

const STORAGE_KEY = "scan_tools";

export const DEFAULT_SCAN_TOOLS: Record<string, boolean> = {
  semgrep: true,
  sonarqube: true,
  customRules: true,
};

export function loadScanTools(): Record<string, boolean> {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return { ...DEFAULT_SCAN_TOOLS };
  try {
    const parsed = JSON.parse(saved) as Record<string, boolean>;
    // `bearer` was SonarQube under an old name; browsers still store that key.
    if (parsed.bearer !== undefined && parsed.sonarqube === undefined) {
      parsed.sonarqube = parsed.bearer;
    }
    delete parsed.bearer;
    // CodeQL was removed: it cannot be licensed for scanning private repos.
    delete parsed.codeql;
    return { ...DEFAULT_SCAN_TOOLS, ...parsed };
  } catch {
    return { ...DEFAULT_SCAN_TOOLS };
  }
}

export function saveScanTools(tools: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
  } catch {
    // Private-mode / quota failures must not block the toggle.
  }
}

/** Flags for `POST /scans/:id/run`. Sensitive data is project info, not a finding, so it stays off. */
export function scanToolFlags(tools: Record<string, boolean>) {
  return {
    enableSemgrep: tools.semgrep,
    enableSonarqube: tools.sonarqube,
    enableCustomRules: tools.customRules,
    enableSensitiveData: false,
  };
}
