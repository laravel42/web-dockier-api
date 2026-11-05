/**
 * Severity and provider are independent filters on the findings list, and the
 * point of having both is composing them.
 *
 * handleSeverityFilter used to clear the provider, so clicking a severity card
 * while on an engine's tab threw you back to All — "show me Semgrep's errors",
 * the narrowing a user reaches for first, was unreachable. Nothing required it:
 * the API applies both filters independently.
 *
 * These assert the composition through the request the hook actually sends,
 * because that is what decides which findings arrive. Asserting only the state
 * would pass even if the filters never reached the query.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const listFindings = vi.fn();
const getScan = vi.fn();
const listScans = vi.fn();

vi.mock("@/services/api", () => ({
  codeAnalysisApi: {
    listFindings: (...args: unknown[]) => listFindings(...args),
    getScan: (...args: unknown[]) => getScan(...args),
    listScans: (...args: unknown[]) => listScans(...args),
  },
  projectsApi: { get: vi.fn(async () => null) },
  gitApi: { getFileContent: vi.fn(async () => ({ content: "" })) },
}));

vi.mock("@/context/ScanProgressContext", () => ({
  useScanProgress: () => ({
    seedFromScan: vi.fn(),
    setOptimisticRunning: vi.fn(),
    clearScanState: vi.fn(),
    trackScan: vi.fn(),
  }),
  useScanLiveState: () => null,
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ scanId: SCAN_ID }),
  useNavigate: () => vi.fn(),
}));

const SCAN_ID = "11111111-1111-4111-8111-111111111111";

/** Counts are global for the scan — the API computes them unfiltered. */
const counts = {
  total: 111,
  errors: 13,
  warnings: 89,
  infos: 9,
  semgrep: 28,
  sonarqube: 78,
  custom: 5,
  byProvider: {
    semgrep: { total: 28, errors: 4, warnings: 22, infos: 2 },
    sonarqube: { total: 78, errors: 8, warnings: 62, infos: 8 },
    custom: { total: 5, errors: 1, warnings: 3, infos: 1 },
  },
};

const scan = {
  id: SCAN_ID,
  projectId: "p-1",
  repo: "acme/app",
  branch: "main",
  status: "completed",
  summary: { totalFindings: 111, errors: 13, warnings: 89, infos: 9, filesScanned: 679, filesInRepo: 679 },
};

/** The options object of the most recent listFindings call. */
function lastQuery() {
  const call = listFindings.mock.calls.at(-1);
  return (call?.[1] ?? {}) as { severity?: string; provider?: string };
}

async function mountHook() {
  const { useScanDetail } = await import("../pages/ScanDetail/useScanDetail");
  const view = renderHook(() => useScanDetail());
  await waitFor(() => expect(listFindings).toHaveBeenCalled());
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  getScan.mockResolvedValue(scan);
  listScans.mockResolvedValue({ scans: [scan] });
  listFindings.mockResolvedValue({ findings: [], counts, hasMore: false, total: 0 });
});

describe("findings filters", () => {
  it("keeps the provider when a severity is picked", async () => {
    const { result } = await mountHook();

    await act(async () => result.current.setProviderFilter("semgrep"));
    await waitFor(() => expect(lastQuery().provider).toBe("semgrep"));

    await act(async () => result.current.handleSeverityFilter("error"));

    // The regression: provider was reset to "" here, sending the user to All.
    await waitFor(() => expect(lastQuery()).toMatchObject({ provider: "semgrep", severity: "error" }));
    expect(result.current.providerFilter).toBe("semgrep");
  });

  it("keeps the severity when a provider is picked", async () => {
    const { result } = await mountHook();

    await act(async () => result.current.handleSeverityFilter("error"));
    await waitFor(() => expect(lastQuery().severity).toBe("error"));

    await act(async () => result.current.setProviderFilter("sonarqube"));

    await waitFor(() => expect(lastQuery()).toMatchObject({ provider: "sonarqube", severity: "error" }));
    expect(result.current.severityFilter).toBe("error");
  });

  it("clicking the active severity again clears only the severity", async () => {
    const { result } = await mountHook();

    await act(async () => result.current.setProviderFilter("semgrep"));
    await act(async () => result.current.handleSeverityFilter("error"));
    await waitFor(() => expect(lastQuery().severity).toBe("error"));

    await act(async () => result.current.handleSeverityFilter("error"));

    await waitFor(() => expect(lastQuery().severity).toBeUndefined());
    expect(result.current.providerFilter).toBe("semgrep");
  });

  it("switching severity directly keeps the provider", async () => {
    const { result } = await mountHook();

    await act(async () => result.current.setProviderFilter("semgrep"));
    await act(async () => result.current.handleSeverityFilter("error"));
    await act(async () => result.current.handleSeverityFilter("warning"));

    await waitFor(() => expect(lastQuery()).toMatchObject({ provider: "semgrep", severity: "warning" }));
  });

  it("leaves an empty provider off the query rather than sending a blank", async () => {
    const { result } = await mountHook();

    await act(async () => result.current.handleSeverityFilter("info"));

    await waitFor(() => expect(lastQuery().severity).toBe("info"));
    expect(lastQuery().provider).toBeUndefined();
  });

  it("keeps an engine's tab selected when that engine found nothing", async () => {
    // The hook used to clear the filter here, moving the user somewhere they
    // had not asked to go. "SonarQube found nothing" and "you are now looking
    // at everything" are different answers; FindingsList says the former.
    listFindings.mockResolvedValue({
      findings: [],
      counts: { ...counts, sonarqube: 0, byProvider: { ...counts.byProvider, sonarqube: { total: 0, errors: 0, warnings: 0, infos: 0 } } },
      hasMore: false,
      total: 0,
    });
    const { result } = await mountHook();

    await act(async () => result.current.setProviderFilter("sonarqube"));

    await waitFor(() => expect(lastQuery().provider).toBe("sonarqube"));
    // Settle any effect that might still reset it.
    await act(async () => { await Promise.resolve(); });
    expect(result.current.providerFilter).toBe("sonarqube");
  });
});

/**
 * The tab labels carry a count, and it used to vanish and reappear on every
 * switch: fetchFindings blanked findingCounts before each request, so the
 * badges rendered nothing until the response landed.
 *
 * Nothing needed it. The API computes those counts per scan and ignores
 * severity and provider, so the value discarded was identical to the one
 * arriving. They do go stale when the scan changes, which is handled separately.
 */
describe("tab counts", () => {
  it("keeps the counts visible while the filtered request is in flight", async () => {
    // The flicker lives between the request starting and the response landing,
    // so the assertion has to happen in that window. Sampling after `act`
    // settles misses it — the counts are already back by then, and the test
    // passes with the bug present.
    const { result } = await mountHook();
    await waitFor(() => expect(result.current.findingCounts).not.toBeNull());
    expect(result.current.findingCounts?.semgrep).toBe(28);

    let release!: () => void;
    listFindings.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ findings: [], counts, hasMore: false, total: 0 });
        }),
    );

    await act(async () => result.current.setProviderFilter("semgrep"));
    await waitFor(() => expect(result.current.findingsLoading).toBe(true));

    // Mid-request: the badges read from this, so a null here is the flicker.
    expect(result.current.findingCounts?.semgrep).toBe(28);

    await act(async () => {
      release();
    });
    expect(result.current.findingCounts?.semgrep).toBe(28);
  });

  it("still clears the counts when the scan itself changes", async () => {
    // Keeping them here would show one scan's totals on another's page.
    const { result, unmount } = await mountHook();
    await waitFor(() => expect(result.current.findingCounts).not.toBeNull());
    unmount();

    vi.resetModules();
    listFindings.mockImplementation(() => new Promise(() => {})); // never resolves
    const { useScanDetail } = await import("../pages/ScanDetail/useScanDetail");
    const fresh = renderHook(() => useScanDetail());

    expect(fresh.result.current.findingCounts).toBeNull();
  });
});
