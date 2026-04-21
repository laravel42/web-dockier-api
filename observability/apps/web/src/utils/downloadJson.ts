import type { LogEntry } from "@observability/types";

/**
 * Serializes the given log entries as a JSON file and triggers a browser download.
 *
 * @param entries - The filtered log entries to export
 * @param filename - Optional filename (defaults to `logs-{timestamp}.json`)
 */
export function downloadJson(
  entries: LogEntry[],
  filename?: string,
): void {
  const name = filename ?? `logs-${Date.now()}.json`;
  const json = JSON.stringify(entries, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();

  // Clean up
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
