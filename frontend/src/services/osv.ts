import { request } from "./request";

/** The subset of an OSV record this app renders. */
export interface OsvVuln {
  details?: string;
  summary?: string;
  aliases?: string[];
}

const OSV_BASE = "https://api.osv.dev";

export const osvApi = {
  /**
   * Public OSV record for a vulnerability id.
   *
   * Routed through `request()` rather than a bare `fetch` so it inherits the
   * shared 30s timeout, caller-abort handling and structured errors — a hung
   * third-party API used to spin the details modal forever.
   */
  getVuln: (id: string, signal?: AbortSignal) =>
    request<OsvVuln>(`/v1/vulns/${encodeURIComponent(id)}`, {
      baseUrl: OSV_BASE,
      // Public endpoint: never forward our bearer token to a third party.
      headers: { Authorization: "" },
      signal,
    }),
};
