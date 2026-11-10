import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Turning a rule off for one organization. Pinned here: the switch saves the id
 * a scan matches against, a failed save is undone and reported (the old panels
 * swallowed it), and every saved change tells the user it only reaches the next
 * scan.
 */
const api = vi.hoisted(() => ({
  listOpengrepRules: vi.fn(),
  listRuleOverrides: vi.fn(),
  toggleRule: vi.fn(),
  listCustomRules: vi.fn(),
  updateCustomRule: vi.fn(),
}));
vi.mock("@/services/api", () => ({ codeAnalysisApi: api }));

const toastError = vi.fn();
vi.mock("@/context/useToast", () => ({ useToast: () => ({ error: toastError, success: vi.fn() }) }));

const SemgrepRulesPanel = (await import("../pages/settings/sections/SemgrepRulesPanel")).default;
const SecurityRulesTab = (await import("../pages/settings/SecurityRulesTab")).default;

const RULE_ID = "ocaml.lang.security.ocamllint-marshal";
const NEXT_SCAN = /apply to the next scan/i;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.listOpengrepRules.mockResolvedValue({
    rules: [{ id: RULE_ID, name: "ocamllint marshal", lang: "ocaml", path: "ocaml/lang/security/marshal.yaml", severity: "warning", category: "lang", message: "m" }],
    languages: ["ocaml"],
  });
  api.listRuleOverrides.mockResolvedValue({ overrides: [] });
  api.toggleRule.mockResolvedValue({ success: true });
  api.listCustomRules.mockResolvedValue({
    rules: [{ id: "r1", ruleId: "custom.php.eval", severity: "error", message: "eval", pattern: "eval\\(", extensions: [".php"], enabled: true }],
  });
  api.updateCustomRule.mockResolvedValue({});
});

describe("Semgrep rule switch", () => {
  it("saves an override for the id the scan reports, and tells the parent", async () => {
    const onChanged = vi.fn();
    render(<SemgrepRulesPanel filter="" onChanged={onChanged} />);

    const toggle = await screen.findByRole("switch", { name: RULE_ID });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await act(async () => fireEvent.click(toggle));

    expect(api.toggleRule).toHaveBeenCalledWith("semgrep", RULE_ID, false);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("undoes the switch and reports it when the save fails", async () => {
    api.toggleRule.mockRejectedValueOnce(new Error("Insufficient permissions"));
    const onChanged = vi.fn();
    render(<SemgrepRulesPanel filter="" onChanged={onChanged} />);

    const toggle = await screen.findByRole("switch", { name: RULE_ID });
    await act(async () => fireEvent.click(toggle));

    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toastError).toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("shows a rule this organization turned off as off", async () => {
    api.listRuleOverrides.mockResolvedValue({ overrides: [{ id: "o1", ruleId: RULE_ID, enabled: false }] });
    render(<SemgrepRulesPanel filter="" onChanged={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("switch", { name: RULE_ID })).toHaveAttribute("aria-checked", "false"));
  });
});

describe("next-scan notice", () => {
  it("appears only after a rule change is saved", async () => {
    render(<SecurityRulesTab />);
    await screen.findByText("custom.php.eval");
    expect(screen.queryByText(NEXT_SCAN)).toBeNull();

    // Custom rule: the engine-level switches come first, the rule's is last.
    const switches = screen.getAllByRole("switch");
    await act(async () => fireEvent.click(switches[switches.length - 1]));

    expect(screen.getByText(NEXT_SCAN)).toBeInTheDocument();
  });

  it("does not appear when the save fails", async () => {
    api.updateCustomRule.mockRejectedValueOnce(new Error("boom"));
    render(<SecurityRulesTab />);
    await screen.findByText("custom.php.eval");

    const switches = screen.getAllByRole("switch");
    await act(async () => fireEvent.click(switches[switches.length - 1]));

    expect(screen.queryByText(NEXT_SCAN)).toBeNull();
  });

  it("appears after a Semgrep rule is turned off", async () => {
    render(<SecurityRulesTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Semgrep" }));

    // Role queries are slow over the whole Settings tab in jsdom.
    const toggle = await screen.findByRole("switch", { name: RULE_ID }, { timeout: 5000 });
    await act(async () => fireEvent.click(toggle));

    expect(screen.getByText(NEXT_SCAN)).toBeInTheDocument();
  });
});
