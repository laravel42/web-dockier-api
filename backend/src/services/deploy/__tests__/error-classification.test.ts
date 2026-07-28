/**
 * Unit tests for pipeline error classification.
 *
 * Tests the classifyPipelineError pure function that maps caught
 * errors into structured categories for notifications and UI messaging.
 */

import { describe, it, expect } from "vitest";
import { classifyPipelineError } from "../domain/pipeline/error-classification.js";
import { BuildError, ProvisionError } from "../../../lib/logging.js";

// ─── Typed Error Instances ─────────────────────────────────────────

describe("classifyPipelineError — typed errors", () => {
  it("classifies BuildError with clone phase", () => {
    const err = new BuildError("git clone failed", "clone");
    expect(classifyPipelineError(err)).toEqual({ category: "build", phase: "clone" });
  });

  it("classifies BuildError with docker-build phase", () => {
    const err = new BuildError("docker build exited 1", "docker-build");
    expect(classifyPipelineError(err)).toEqual({ category: "build", phase: "docker-build" });
  });

  it("classifies BuildError with analyze phase", () => {
    const err = new BuildError("analysis failed", "analyze");
    expect(classifyPipelineError(err)).toEqual({ category: "build", phase: "analyze" });
  });

  it("classifies ProvisionError with aws provider", () => {
    const err = new ProvisionError("stack failed", "aws", "ec2");
    expect(classifyPipelineError(err)).toEqual({ category: "infra", phase: "aws" });
  });

  it("classifies ProvisionError with gcp provider", () => {
    const err = new ProvisionError("Cloud Run deployment failed", "gcp", "cloud-run");
    expect(classifyPipelineError(err)).toEqual({ category: "infra", phase: "gcp" });
  });
});

// ─── Infra Heuristics ──────────────────────────────────────────────

describe("classifyPipelineError — infra heuristics", () => {
  const infraMessages = [
    "CloudFormation stack creation failed",
    "Pulumi up failed with exit code 1",
    "Failed to provision resources",
    "Stack creation failed: ROLLBACK_COMPLETE",
    "Stack update failed",
    "CreateStack returned error",
    "UpdateStack returned error",
    "Cloud Run service unhealthy",
    "ECS service failed to stabilize",
    "ECR repository creation failed",
    "Capacity constraints: no available instances",
    "InstanceLimitExceeded",
    "vCPU limit reached",
  ];

  for (const msg of infraMessages) {
    it(`classifies "${msg.slice(0, 50)}..." as infra`, () => {
      const result = classifyPipelineError(new Error(msg));
      expect(result.category).toBe("infra");
      expect(result.phase).toBe("provision");
    });
  }
});

// ─── Post-Deploy Heuristics ────────────────────────────────────────

describe("classifyPipelineError — post-deploy heuristics", () => {
  const postDeployMessages = [
    "Post-deploy script failed",
    "post_deploy command timed out",
    "Deploy script failed with exit code 1",
    "SSM command failed after 3 retries",
  ];

  for (const msg of postDeployMessages) {
    it(`classifies "${msg}" as post-deploy`, () => {
      const result = classifyPipelineError(new Error(msg));
      expect(result.category).toBe("post-deploy");
    });
  }
});

// ─── Build/Clone Heuristics ────────────────────────────────────────

describe("classifyPipelineError — build/clone heuristics", () => {
  it("classifies git clone errors as build:clone", () => {
    const messages = [
      "git clone failed with exit code 128",
      "Failed to clone repository",
      "Clone failed: permission denied",
      "Repository not found",
      "Authentication failed for https://github.com/acme/app",
      "Git connection not found for id abc-123",
      "Could not resolve host: github.com",
    ];

    for (const msg of messages) {
      const result = classifyPipelineError(new Error(msg));
      expect(result).toEqual({ category: "build", phase: "clone" });
    }
  });

  it("classifies docker build errors as build:docker-build", () => {
    const messages = [
      "Dockerfile syntax error on line 5",
      "docker build exited with code 1",
      "docker buildx build failed",
      "Failed to build image: COPY failed",
      "Build failed: npm run build returned non-zero",
      "Process exited with code 1",
      "npm run build failed",
      "pnpm build returned error",
      "yarn build exited 1",
      "composer install failed",
      "pip install -r requirements.txt failed",
    ];

    for (const msg of messages) {
      const result = classifyPipelineError(new Error(msg));
      expect(result).toEqual({ category: "build", phase: "docker-build" });
    }
  });

  it("classifies docker push/pull errors as build:docker-build", () => {
    const messages = [
      "Failed to pull docker image from ECR",
      "docker pull timed out",
      "docker push failed: authorization required",
      "Image push failed after 3 retries",
      "docker tag command failed",
    ];

    for (const msg of messages) {
      const result = classifyPipelineError(new Error(msg));
      expect(result).toEqual({ category: "build", phase: "docker-build" });
    }
  });
});

// ─── Unknown / Edge Cases ──────────────────────────────────────────

describe("classifyPipelineError — unknown and edge cases", () => {
  it("returns unknown for generic Error messages", () => {
    expect(classifyPipelineError(new Error("Something went wrong"))).toEqual({ category: "unknown" });
  });

  it("returns unknown for non-Error values", () => {
    expect(classifyPipelineError("string error")).toEqual({ category: "unknown" });
    expect(classifyPipelineError(null)).toEqual({ category: "unknown" });
    expect(classifyPipelineError(undefined)).toEqual({ category: "unknown" });
    expect(classifyPipelineError(42)).toEqual({ category: "unknown" });
    expect(classifyPipelineError({})).toEqual({ category: "unknown" });
  });

  it("infra patterns take priority over build patterns", () => {
    // "ECR repository" contains infra-specific language even though it has "repository"
    const result = classifyPipelineError(new Error("ECR repository creation failed"));
    expect(result.category).toBe("infra");
  });
});
