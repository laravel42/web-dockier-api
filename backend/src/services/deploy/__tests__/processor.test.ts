/**
 * Unit tests for processor pure functions.
 *
 * Tests deriveServerIpFromUrl and buildInfraMetadata — both are pure
 * functions with no I/O, extracted specifically for testability.
 */

import { describe, it, expect, vi } from "vitest";
import { createTestEnv } from "../../../shared/__tests__/test-helpers.js";

vi.mock("../../../shared/config.js", () => ({
  env: createTestEnv(),
}));

vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { deriveServerIpFromUrl, buildInfraMetadata, type BuildInfraParams } from "../domain/processor.js";

// ─── deriveServerIpFromUrl ─────────────────────────────────────────

describe("deriveServerIpFromUrl", () => {
  it("extracts IP from standard EC2 public DNS", () => {
    expect(deriveServerIpFromUrl("http://ec2-1-2-3-4.compute-1.amazonaws.com")).toBe("1.2.3.4");
  });

  it("extracts IP from HTTPS EC2 URL", () => {
    expect(deriveServerIpFromUrl("https://ec2-54-210-167-99.compute-1.amazonaws.com:3000/api")).toBe("54.210.167.99");
  });

  it("extracts IP from EC2 URL with region in hostname", () => {
    expect(deriveServerIpFromUrl("http://ec2-10-0-1-200.eu-west-1.compute.amazonaws.com")).toBe("10.0.1.200");
  });

  it("returns empty string for non-EC2 URLs", () => {
    expect(deriveServerIpFromUrl("https://my-app.example.com")).toBe("");
  });

  it("returns empty string for ECS/Cloud Run URLs", () => {
    expect(deriveServerIpFromUrl("https://my-app.us-east-1.elb.amazonaws.com")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(deriveServerIpFromUrl("")).toBe("");
  });

  it("returns empty string for plain IP (no ec2- prefix)", () => {
    expect(deriveServerIpFromUrl("http://1.2.3.4:3000")).toBe("");
  });
});

// ─── buildInfraMetadata ────────────────────────────────────────────

describe("buildInfraMetadata", () => {
  const baseParams: BuildInfraParams = {
    repo: "acme/my-app",
    deployStrategy: "vps",
    region: "us-east-1",
    serverIp: "1.2.3.4",
  };

  it("builds EC2 infra metadata for VPS strategy", () => {
    const infra = buildInfraMetadata(baseParams);

    expect(infra.provider).toBe("aws");
    expect(infra.service).toBe("ec2");
    expect(infra.region).toBe("us-east-1");
    expect(infra.containerName).toBe("my-app");
    expect(infra.stackName).toBe("image-builder-app-my-app");
    expect(infra.serverIp).toBe("1.2.3.4");
    expect(infra.instanceId).toBeUndefined();
    expect(infra.ecsCluster).toBeUndefined();
  });

  it("builds ECS infra metadata for managed strategy", () => {
    const infra = buildInfraMetadata({
      ...baseParams,
      deployStrategy: "managed",
      serverIp: "",
    });

    expect(infra.service).toBe("ecs");
    expect(infra.ecsCluster).toBe("my-app");
    expect(infra.ecsTaskFamily).toBe("my-app");
    expect(infra.serverIp).toBeUndefined();
  });

  it("builds S3 infra metadata for static strategy", () => {
    const infra = buildInfraMetadata({
      ...baseParams,
      deployStrategy: "static",
      serverIp: "",
    });

    expect(infra.service).toBe("s3");
    expect(infra.ecsCluster).toBeUndefined();
  });

  it("respects explicit deployTarget over strategy", () => {
    const infra = buildInfraMetadata({
      ...baseParams,
      deployStrategy: "vps",
      deployTarget: "ecs",
    });

    expect(infra.service).toBe("ecs");
    expect(infra.ecsCluster).toBe("my-app");
  });

  it("uses custom stackName when provided", () => {
    const infra = buildInfraMetadata({
      ...baseParams,
      stackName: "custom-stack-name",
    });

    expect(infra.stackName).toBe("custom-stack-name");
  });

  it("uses custom containerName when provided", () => {
    const infra = buildInfraMetadata({
      ...baseParams,
      containerName: "custom-container",
    });

    expect(infra.containerName).toBe("custom-container");
  });

  it("includes instanceId when provided", () => {
    const infra = buildInfraMetadata({
      ...baseParams,
      instanceId: "i-0abc123def456",
    });

    expect(infra.instanceId).toBe("i-0abc123def456");
  });

  it("defaults region to us-east-1 when empty", () => {
    const infra = buildInfraMetadata({
      ...baseParams,
      region: "",
    });

    expect(infra.region).toBe("us-east-1");
  });

  it("does not include serverIp when empty", () => {
    const infra = buildInfraMetadata({
      ...baseParams,
      serverIp: "",
    });

    expect(infra.serverIp).toBeUndefined();
  });

  it("normalizes repo name with special characters", () => {
    const infra = buildInfraMetadata({
      ...baseParams,
      repo: "acme/My-App.io",
    });

    expect(infra.containerName).toBe("my-app-io");
    expect(infra.stackName).toBe("image-builder-app-my-app-io");
  });
});
