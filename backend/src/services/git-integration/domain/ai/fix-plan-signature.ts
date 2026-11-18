/**
 * `fix-issue/apply` gets the plan back from the client, so without a signature a
 * caller could commit any content to any path (e.g. a CI workflow, which runs on
 * the pushed branch with the repository's secrets). The plan route signs exactly
 * what it generated; apply refuses anything else.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface SignedPlanFields {
  summary: string;
  prDescription: string;
  branchName: string;
  baseBranch: string;
  issueNumber: number;
  issueTitle: string;
  files: Array<{ path: string; before: string; after: string }>;
}

export interface PlanScope {
  tenantId: string;
  connectionId: string;
  owner: string;
  repo: string;
}

export function signFixPlan(plan: SignedPlanFields, scope: PlanScope, secret: string): string {
  const payload = JSON.stringify([
    "fix-plan:v1", scope.tenantId, scope.connectionId, scope.owner, scope.repo,
    plan.summary, plan.prDescription, plan.branchName, plan.baseBranch, plan.issueNumber, plan.issueTitle,
    plan.files.map((f) => [f.path, f.before, f.after]),
  ]);
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function isFixPlanSignatureValid(
  plan: SignedPlanFields,
  signature: string,
  scope: PlanScope,
  secret: string,
): boolean {
  const expected = Buffer.from(signFixPlan(plan, scope, secret), "hex");
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
