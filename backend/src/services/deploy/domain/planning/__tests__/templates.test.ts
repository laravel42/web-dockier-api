import { describe, expect, it } from "vitest";
import { resolveDeployTemplate } from "../templates.js";

/**
 * resolveDeployTemplate falls through to DEPLOY_TEMPLATES[0] when nothing
 * matches, so a missing (provider, strategy) pair does not error — it silently
 * returns an unrelated template. That is how AWS + static ended up resolving to
 * `aws-managed-node`, handing a static deploy an ECS template and the wrong
 * build_method. These tests pin the pairs that must resolve exactly.
 */
describe("resolveDeployTemplate", () => {
  const base = { primaryLanguage: "typescript", techStack: ["Vite", "React"] };

  it("resolves aws + static to the S3/CloudFront template", () => {
    const template = resolveDeployTemplate({ ...base, provider: "aws", strategy: "static" });
    expect(template.id).toBe("aws-static-generic");
    expect(template.strategy).toBe("static");
    expect(template.provider).toBe("aws");
  });

  it("resolves gcp + static to the Cloud Storage template", () => {
    const template = resolveDeployTemplate({ ...base, provider: "gcp", strategy: "static" });
    expect(template.id).toBe("gcp-static-site");
    expect(template.strategy).toBe("static");
  });

  it("never resolves a static request to a non-static template", () => {
    // The regression guard: before aws-static-generic existed this returned
    // aws-managed-node, i.e. strategy "managed" for a "static" request.
    for (const provider of ["aws", "gcp"]) {
      const template = resolveDeployTemplate({ ...base, provider, strategy: "static" });
      expect(template.strategy).toBe("static");
    }
  });

  it("still resolves the non-static pairs", () => {
    expect(resolveDeployTemplate({ ...base, provider: "aws", strategy: "vps" }).id).toBe("aws-vps-generic");
    expect(resolveDeployTemplate({ ...base, provider: "aws", strategy: "managed" }).id).toBe("aws-managed-node");
    expect(resolveDeployTemplate({ ...base, provider: "gcp", strategy: "managed" }).id).toBe("gcp-managed-service");
  });

  it("honours an explicit templateId over provider/strategy matching", () => {
    const template = resolveDeployTemplate({
      ...base,
      provider: "aws",
      strategy: "static",
      requestedTemplateId: "aws-vps-generic",
    });
    expect(template.id).toBe("aws-vps-generic");
  });

  it("treats an unknown provider as aws", () => {
    const template = resolveDeployTemplate({ ...base, provider: "azure", strategy: "static" });
    expect(template.provider).toBe("aws");
    expect(template.strategy).toBe("static");
  });
});
