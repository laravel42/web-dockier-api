import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { panelId, tabId, useTabListKeyboard } from "../hooks/useTabListKeyboard";
import {
  RUNTIME_TABS,
  dependencyAlarm,
  isRuntimeTabVisible,
  securityAlarm,
  sensitiveDataAlarm,
} from "../pages/ProjectDetail/navAlarms";
import type { Dependency } from "@/components/DeployWizard";
import type { Deployment } from "@/types";
import type { Scan } from "@/types/scan";

/**
 * The nav rules from docs/delivery/project-detail-ia.md. These call the same
 * functions ProjectDescription calls — testing a copy of the rules would pass
 * happily while the component did something else.
 */

const deploy = (status: string) => ({ status }) as Deployment;
const scan = (errors: number, warnings: number, infos: number, totalFindings?: number) =>
  ({ summary: { errors, warnings, infos, totalFindings } }) as Scan;
const dep = (vulns: number, status?: string) =>
  ({ vulnerabilities: Array.from({ length: vulns }, () => ({})), status }) as unknown as Dependency;

describe("Runtime cluster gating", () => {
  it("hides all four Runtime tabs on a project that has never deployed", () => {
    for (const key of RUNTIME_TABS) expect(isRuntimeTabVisible(key, []), key).toBe(false);
  });

  it("still hides them when every deploy failed", () => {
    const deploys = [deploy("failed"), deploy("building")];
    for (const key of RUNTIME_TABS) expect(isRuntimeTabVisible(key, deploys), key).toBe(false);
  });

  it("reveals them once any deploy succeeded, even if the latest failed", () => {
    // A later failure does not un-ship it — the server exists and can be inspected.
    const deploys = [deploy("failed"), deploy("success")];
    for (const key of RUNTIME_TABS) expect(isRuntimeTabVisible(key, deploys), key).toBe(true);
  });

  it("treats undefined deploys as never shipped rather than throwing", () => {
    for (const key of RUNTIME_TABS) expect(isRuntimeTabVisible(key, undefined), key).toBe(false);
  });

  it("never gates a non-Runtime tab", () => {
    for (const key of ["overview", "security", "dependencies", "settings"]) {
      expect(isRuntimeTabVisible(key, []), key).toBe(true);
    }
  });
});

describe("alarm counts", () => {
  it("counts errors and warnings, never infos", () => {
    // 40 infos are not 40 things to do; totalFindings would claim 43.
    expect(securityAlarm([scan(1, 2, 40, 43)])).toMatchObject({ count: 3, tone: "danger" });
  });

  it("shows no badge for an infos-only scan", () => {
    expect(securityAlarm([scan(0, 0, 12)])).toBeNull();
  });

  it("drops to warning tone when nothing is an error", () => {
    expect(securityAlarm([scan(0, 5, 0)])).toMatchObject({ count: 5, tone: "warning" });
  });

  it("shows no badge on a clean scan, rather than a zero", () => {
    expect(securityAlarm([scan(0, 0, 0)])).toBeNull();
  });

  it("shows no badge when the project has never been scanned", () => {
    expect(securityAlarm([])).toBeNull();
    expect(securityAlarm(undefined)).toBeNull();
  });

  it("names what the number counts, for screen readers", () => {
    expect(securityAlarm([scan(1, 0, 0)])?.label).toBe("1 finding needing attention");
    expect(securityAlarm([scan(2, 0, 0)])?.label).toBe("2 findings needing attention");
  });

  it("counts dependencies at risk, not the dependency total", () => {
    const deps = [
      dep(0, "active"),
      dep(0, "active"),
      dep(1, "active"),
      dep(0, "outdated"),
      dep(0, "deprecated"),
    ];
    expect(deps).toHaveLength(5);
    expect(dependencyAlarm(deps)).toMatchObject({ count: 3, tone: "warning" });
  });

  it("shows no dependency badge when everything is current and clean", () => {
    expect(dependencyAlarm([dep(0, "active"), dep(0, "active")])).toBeNull();
  });

  it("flags sensitive fields in the caution tone", () => {
    expect(sensitiveDataAlarm([{}, {}])).toMatchObject({ count: 2, tone: "caution" });
    expect(sensitiveDataAlarm([])).toBeNull();
    expect(sensitiveDataAlarm(null)).toBeNull();
  });
});

describe("grouped tablist keyboard", () => {
  const TABS = [
    { key: "overview", cluster: "understand" },
    { key: "activity", cluster: "understand" },
    { key: "security", cluster: "risk" },
    { key: "settings", cluster: "configure" },
  ] as const;
  const CLUSTERS = ["understand", "risk", "configure"] as const;
  const KEYS = TABS.map((t) => t.key);

  const GroupedNav = () => {
    const [active, setActive] = useState<(typeof KEYS)[number]>("overview");
    const onKeyDown = useTabListKeyboard(KEYS, setActive, "both");
    return (
      <>
        <div role="tablist" aria-label="Project sections">
          {CLUSTERS.map((c) => (
            // Presentational wrapper: the tablist must still own the tabs directly.
            <div key={c} role="presentation">
              <p aria-hidden="true">{c}</p>
              {TABS.filter((t) => t.cluster === c).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  id={tabId(t.key)}
                  aria-controls={panelId(t.key)}
                  aria-selected={active === t.key}
                  tabIndex={active === t.key ? 0 : -1}
                  onKeyDown={(e) => onKeyDown(e, t.key)}
                >
                  {t.key}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div role="tabpanel" id={panelId(active)} aria-labelledby={tabId(active)} />
      </>
    );
  };

  it("keeps the tablist owning every tab despite the group wrappers", () => {
    render(<GroupedNav />);
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });

  it("arrows across a group boundary, not just within a group", async () => {
    render(<GroupedNav />);
    const user = userEvent.setup();
    await user.tab();

    await user.keyboard("{ArrowRight}"); // overview -> activity, same group
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName("activity");

    await user.keyboard("{ArrowRight}"); // activity -> security, crosses into "risk"
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName("security");

    await user.keyboard("{End}"); // jumps to the last tab in the last group
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName("settings");
  });

  it("exposes exactly one tab stop across all groups", () => {
    render(<GroupedNav />);
    const stops = screen.getAllByRole("tab").filter((t) => t.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
  });

  it("keeps group headings out of the accessibility tree", () => {
    render(<GroupedNav />);
    // aria-hidden, so present in the DOM but never announced and never a tab stop.
    expect(screen.getByText("understand")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "overview",
      "activity",
      "security",
      "settings",
    ]);
  });
});
