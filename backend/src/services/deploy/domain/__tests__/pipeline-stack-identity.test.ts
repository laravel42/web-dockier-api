/**
 * PipelineContext.stackName — which stack a deploy acts on.
 *
 * `stackNameFor()` is a pure function of the repo name, so deriving the stack
 * name on every deploy means a repo rename silently points the deploy at a name
 * that was never created: a second stack appears, the first keeps the CDN
 * distribution serving the live domain, and the deploy still reports success.
 * The context therefore inherits the name recorded by the project's last
 * successful deployment and only derives one when there is nothing to inherit.
 */
import { describe, it, expect, vi } from "vitest";
import { createTestEnv } from "../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../shared/config.js", () => ({ env: createTestEnv() }));

const { PipelineContext } = await import("../pipeline/context.js");

type PipelineInput = ConstructorParameters<typeof PipelineContext>[0];

const noopLogger = {
  info: () => {},
  success: () => {},
  warn: () => {},
  error: () => {},
  section: () => {},
};

function ctxFor(repo: string) {
  const event = { deploymentId: "dep-12345678", repo, deployStrategy: "static" } as unknown as PipelineInput;
  return new PipelineContext(event, noopLogger as never, (() => {}) as never);
}

describe("PipelineContext.stackName", () => {
  it("derives from the repo name on a first deploy, when there is nothing to inherit", () => {
    const ctx = ctxFor("acme/my-app");

    expect(ctx.priorInfra).toBeNull();
    expect(ctx.stackName).toBe("image-builder-app-my-app");
  });

  it("inherits the stack the project already owns", () => {
    const ctx = ctxFor("acme/my-app");
    ctx.priorInfra = { stackName: "image-builder-app-my-app" } as never;

    expect(ctx.stackName).toBe("image-builder-app-my-app");
  });

  it("keeps the inherited stack after the repo is renamed", () => {
    // The project deployed as "old-name" and the repo was renamed afterwards.
    const ctx = ctxFor("acme/renamed-app");
    ctx.priorInfra = { stackName: "image-builder-app-old-name" } as never;

    expect(ctx.stackName).toBe("image-builder-app-old-name");
    // The failure this guards against: deriving "image-builder-app-renamed-app"
    // and abandoning the stack that owns the live distribution.
    expect(ctx.stackName).not.toContain("renamed-app");
  });

  it("falls back to derivation when prior infra exists but recorded no stack name", () => {
    // Rows that predate InfraMetadata.stackName persistence.
    const ctx = ctxFor("acme/my-app");
    ctx.priorInfra = { provider: "aws", region: "us-east-1" } as never;

    expect(ctx.stackName).toBe("image-builder-app-my-app");
  });
});
