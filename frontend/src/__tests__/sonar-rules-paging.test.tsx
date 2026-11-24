import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * The SonarQube API pages active rules at 500. The panel read only page 1, so the
 * rest of a large default profile could not be seen or turned off.
 */
const api = vi.hoisted(() => ({
  listSonarProfiles: vi.fn(),
  listSonarRules: vi.fn(),
  listRuleOverrides: vi.fn(),
  toggleRule: vi.fn(),
}));
vi.mock("@/services/api", () => ({ codeAnalysisApi: api }));
vi.mock("@/context/useToast", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }));

const SonarQubeRulesPanel = (await import("../pages/Settings/sections/SonarQubeRulesPanel")).default;

const rule = (key: string) => ({
  key, name: key, severity: "MAJOR", lang: "java", langName: "Java", type: "BUG", status: "READY",
  isActive: true, cleanCodeAttribute: "", impacts: [],
});

describe("SonarQube rules panel", () => {
  it("reads every page of a profile, not only the first", async () => {
    api.listSonarProfiles.mockResolvedValue({
      profiles: [{ key: "java-way", name: "Sonar way", language: "java", languageName: "Java", isDefault: true, activeRuleCount: 3 }],
    });
    // A tiny page size stands in for 500: two pages, then the total is reached.
    api.listSonarRules.mockImplementation(async (_profile: string, page: number) =>
      page === 1 ? { rules: [rule("java:S1"), rule("java:S2")], total: 3 } : { rules: [rule("java:S3")], total: 3 },
    );
    api.listRuleOverrides.mockResolvedValue({ overrides: [] });

    render(<SonarQubeRulesPanel filter="java:S3" onChanged={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("switch", { name: "java:S3" })).toBeInTheDocument());
    expect(api.listSonarRules).toHaveBeenCalledTimes(2);
  });
});
