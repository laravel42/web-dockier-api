import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProviderFilters } from "../pages/ScanDetail/sections/FindingsList";
import type { SecurityFindingCounts } from "@/types";

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

function renderFilters(providerFilter = "") {
  const onProviderFilterChange = vi.fn();
  render(
    <ProviderFilters
      findingCounts={counts}
      providerFilter={providerFilter}
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
