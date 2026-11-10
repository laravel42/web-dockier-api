/**
 * Which security engines a scan runs. Stored per browser in `localStorage` —
 * the Settings page writes it, the scan page reads it, so both must agree on
 * the defaults and on the legacy key migration. Previously each side had its
 * own copy and they disagreed: a stored value showed one thing in Settings
 * while the scan page did another.
 */

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

/**
 * Map the stored toggles onto the flags `POST /scans/:id/run` expects.
 *
 * `enableSensitiveData` stays off: schema-derived field classification is
 * project information, not a security finding, and the backend gates it the
 * same way (`options.enableSensitiveData === true`, opt-in rather than
 * opt-out).
 */
export function scanToolFlags(tools: Record<string, boolean>) {
  return {
    enableSemgrep: tools.semgrep,
    enableSonarqube: tools.sonarqube,
    enableCustomRules: tools.customRules,
    enableSensitiveData: false,
  };
}
