import { describe, expect, it } from "vitest";
import { encodeProjectPath } from "../providers/gitlab-client.js";

describe("encodeProjectPath", () => {
  it("encodes nested GitLab group paths", () => {
    expect(encodeProjectPath("quattrolinee/cfp", "www-portale_bestcare")).toBe(
      "quattrolinee%2Fcfp%2Fwww-portale_bestcare",
    );
  });

  it("encodes simple owner/repo paths", () => {
    expect(encodeProjectPath("acme", "app")).toBe("acme%2Fapp");
  });
});
