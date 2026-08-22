import { describe, expect, it } from "vitest";
import { projectInfraDotClass } from "@/utils/projectInfraDot";

describe("projectInfraDotClass", () => {
  it("is red when the last deploy failed", () => {
    expect(projectInfraDotClass("live", "failed")).toBe("bg-danger-500");
    expect(projectInfraDotClass("none", "failed")).toBe("bg-danger-500");
  });

  it("is green only when infrastructure is live", () => {
    expect(projectInfraDotClass("live", "success")).toBe("bg-success-500");
    expect(projectInfraDotClass("live", "deploying")).toBe("bg-success-500");
  });

  it("is grey when never deployed or infra is not active", () => {
    expect(projectInfraDotClass("none", "success")).toBe("bg-secondary-400");
    expect(projectInfraDotClass("torn_down", "success")).toBe("bg-secondary-400");
    expect(projectInfraDotClass(undefined)).toBe("bg-secondary-400");
  });
});
