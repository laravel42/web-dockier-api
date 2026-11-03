/**
 * Which security engines a scan runs. Stored per browser in `localStorage` —
 * the Settings page writes it, the scan page reads it, so both must agree on
 * the defaults and on the legacy key migration. Previously each side had its
 * own copy and they disagreed: a stored `sonarqube: false` showed Bearer off in
 * Settings while the scan page still enabled it.
 */

const STORAGE_KEY = "scan_tools";

/** Semgrep is off everywhere: the engine is not wired up in this deployment. */
export const DEFAULT_SCAN_TOOLS: Record<string, boolean> = {
  semgrep: false,
  bearer: true,
  customRules: true,
  codeql: true,
};

export function loadScanTools(): Record<string, boolean> {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return { ...DEFAULT_SCAN_TOOLS };
  try {
    const parsed = JSON.parse(saved) as Record<string, boolean>;
    // `sonarqube` was renamed to `bearer`; honour the old value either way.
    if (parsed.sonarqube !== undefined && parsed.bearer === undefined) {
      parsed.bearer = parsed.sonarqube;
      delete parsed.sonarqube;
    }
    return { ...DEFAULT_SCAN_TOOLS, ...parsed, semgrep: false };
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

/** Map the stored toggles onto the flags `POST /scans/:id/run` expects. */
export function scanToolFlags(tools: Record<string, boolean>) {
  return {
    enableSemgrep: false,
    // One engine, two flag names on the API — `sonarqube` is the legacy spelling.
    enableBearer: tools.bearer,
    enableSonarqube: tools.bearer,
    enableCustomRules: tools.customRules,
    enableCodeql: tools.codeql,
    enableSensitiveData: false,
  };
}
