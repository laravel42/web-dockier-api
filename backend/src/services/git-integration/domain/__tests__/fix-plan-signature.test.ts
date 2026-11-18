import { describe, expect, it } from "vitest";
import { isFixPlanSignatureValid, signFixPlan } from "../ai/fix-plan-signature.js";

const plan = {
  summary: "s", prDescription: "d", branchName: "fix/1-x-abcde", baseBranch: "main",
  issueNumber: 1, issueTitle: "t", files: [{ path: "src/a.ts", before: "a", after: "b" }],
};
const scope = { tenantId: "t1", connectionId: "c1", owner: "o", repo: "r" };
const secret = "s".repeat(32);

describe("fix plan signature", () => {
  const sig = signFixPlan(plan, scope, secret);
  it("accepts the plan it signed", () => expect(isFixPlanSignatureValid(plan, sig, scope, secret)).toBe(true));
  it("refuses changed file content or path", () => {
    expect(isFixPlanSignatureValid({ ...plan, files: [{ ...plan.files[0]!, after: "evil" }] }, sig, scope, secret)).toBe(false);
    expect(isFixPlanSignatureValid({ ...plan, files: [{ ...plan.files[0]!, path: ".github/workflows/x.yml" }] }, sig, scope, secret)).toBe(false);
  });
  it("refuses another tenant, connection or repo", () => {
    expect(isFixPlanSignatureValid(plan, sig, { ...scope, tenantId: "t2" }, secret)).toBe(false);
    expect(isFixPlanSignatureValid(plan, sig, { ...scope, repo: "other" }, secret)).toBe(false);
  });
  it("refuses a malformed signature", () => expect(isFixPlanSignatureValid(plan, "zz", scope, secret)).toBe(false));
});
