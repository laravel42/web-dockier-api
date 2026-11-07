import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProviderFilters } from "../pages/ScanDetail/sections/FindingsList";
import { emptyFilterMessage } from "../pages/ScanDetail/utils/providerFilters";
import SkippedEnginesNotice from "../pages/ScanDetail/sections/SkippedEnginesNotice";
import type { SecurityFindingCounts, SkippedEngine } from "@/types";

/**
 * An engine the API can filter by, with no tab to filter by it.
 *
 * This gap has shipped twice. The Bearer rename dropped the Semgrep tab in the
 * same commit that disabled the engine — reasonable then, since the tab would
 * always have read zero, but it stayed dropped after the engine came back. The
 * SonarQube findings had a tab the whole time, yet no on/off toggle in Settings,
 * because the toggle that controlled them was labelled Bearer.
 *
 * Both times the backend was complete and the surface was not, so nothing
 * failed: the findings were persisted and returned, just unreachable through
 * the UI. Deriving the expected tabs from `byProvider` rather than restating a
 * list is what makes the next omission fail here.
 */

const counts: SecurityFindingCounts = {
  total: 83,
  errors: 13,
  warnings: 61,
  infos: 9,
  semgrep: 24,
  sonarqube: 54,
  custom: 5,
  byProvider: {
    semgrep: { total: 24, errors: 4, warnings: 18, infos: 2 },
    sonarqube: { total: 54, errors: 8, warnings: 40, infos: 6 },
    custom: { total: 5, errors: 1, warnings: 3, infos: 1 },
  },
};

function renderFilters(providerFilter = "", skippedEngines: SkippedEngine[] = []) {
  const onProviderFilterChange = vi.fn();
  render(
    <ProviderFilters
      findingCounts={counts}
      providerFilter={providerFilter}
      skippedEngines={skippedEngines}
      onProviderFilterChange={onProviderFilterChange}
    />,
  );
  return { onProviderFilterChange };
}

describe("ProviderFilters", () => {
  it("offers a tab for every provider the counts carry, plus All", () => {
    renderFilters();

    const tabs = screen.getAllByRole("radio");
    // Derived, not restated: a provider added to byProvider with no tab fails
    // here instead of silently becoming unfilterable.
    expect(tabs).toHaveLength(Object.keys(counts.byProvider).length + 1);
  });

  it.each(Object.keys(counts.byProvider) as Array<keyof typeof counts.byProvider>)(
    "shows the %s provider with its own count",
    (provider) => {
      renderFilters();

      const labels: Record<string, string> = {
        semgrep: "Semgrep",
        sonarqube: "SonarQube",
        custom: "Custom rules",
      };
      const tab = screen.getByRole("radio", { name: new RegExp(labels[provider], "i") });

      expect(tab).toBeTruthy();
      expect(tab.textContent).toContain(String(counts.byProvider[provider].total));
    },
  );

  it("marks only the active provider as selected", () => {
    renderFilters("semgrep");

    const selected = screen
      .getAllByRole("radio")
      .filter((tab) => tab.getAttribute("aria-checked") === "true");

    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain("Semgrep");
  });

  it("treats an empty filter as All", () => {
    renderFilters("");

    const selected = screen
      .getAllByRole("radio")
      .filter((tab) => tab.getAttribute("aria-checked") === "true");

    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain("All");
  });
});

/**
 * The reply when a filtered list comes back empty — including when an engine
 * found nothing in the whole scan, because its tab now stays selected instead
 * of the hook silently moving the user to All.
 *
 * Phrased as a statement about the engine, not about the query: a scan that
 * found nothing is the reassuring case, and the old wording ("No findings match
 * Semgrep and severity \"error\"") read like a failure.
 */
describe("emptyFilterMessage", () => {
  it.each([
    ["semgrep", "", "No Semgrep findings in this scan."],
    ["sonarqube", "", "No SonarQube findings in this scan."],
    ["custom", "", "No Custom rules findings in this scan."],
    ["semgrep", "error", 'No Semgrep findings with severity "error" in this scan.'],
    ["", "warning", 'No findings with severity "warning" in this scan.'],
    ["", "", "No security findings for this scan."],
  ])("provider %s + severity %s", (provider, severity, expected) => {
    expect(emptyFilterMessage(severity, provider)).toBe(expected);
  });

  it("uses the tab's label, not the raw provider key", () => {
    // `sonarqube` would read as a key; the tab says SonarQube.
    expect(emptyFilterMessage("", "sonarqube")).toContain("SonarQube");
    expect(emptyFilterMessage("", "sonarqube")).not.toContain("sonarqube");
  });

  it("falls back to the key for a provider with no tab", () => {
    // Should not happen — provider-filters above pins that every provider has a
    // tab — but a missing label must not render "No undefined findings".
    expect(emptyFilterMessage("", "codeql")).toBe("No codeql findings in this scan.");
  });
});

/**
 * A scan status has no "degraded" value, so a stopped SonarQube produced
 * "completed" with a SonarQube tab reading (0) — indistinguishable from a clean
 * run. These pin the three places that now have to say otherwise.
 */
describe("an engine that did not run", () => {
  const skipped: SkippedEngine[] = [
    { engine: "sonarqube", reason: "could not be reached" },
  ];

  it("replaces the tab's count, which would read as zero findings", () => {
    renderFilters("", skipped);

    const tab = screen.getByRole("radio", { name: /SonarQube/ });
    expect(tab).toHaveTextContent("did not run");
    expect(tab).not.toHaveTextContent("(54)");
    // The other engines keep their counts.
    expect(screen.getByRole("radio", { name: /Semgrep/ })).toHaveTextContent("(24)");
  });

  it("answers an empty tab with the reason, not 'No findings'", () => {
    expect(emptyFilterMessage("", "sonarqube", skipped)).toBe(
      "SonarQube could not be reached, so this scan has no SonarQube results.",
    );
    // Another engine's empty tab is unaffected.
    expect(emptyFilterMessage("", "semgrep", skipped)).toBe("No Semgrep findings in this scan.");
  });

  it("shows a notice naming the engine, with something the reader can do", () => {
    render(<SkippedEnginesNotice engines={skipped} />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("This scan is incomplete.");
    expect(notice).toHaveTextContent("SonarQube could not be reached.");
    expect(notice).toHaveTextContent("Run the scan again");
    expect(notice).toHaveTextContent("contact your administrator");
  });

  it("renders nothing when every engine ran", () => {
    const { container } = render(<SkippedEnginesNotice engines={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
