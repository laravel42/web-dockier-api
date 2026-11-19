import { describe, expect, it, vi } from "vitest";
vi.mock("../../../../shared/supabase/client.js", () => ({ supabaseAdmin: {} }));
import { parseRepoUrl } from "../connections.js";

describe("parseRepoUrl", () => {
  it("keeps GitLab subgroups in the owner", () => {
    expect(parseRepoUrl("https://gitlab.com/group/sub/repo.git")).toEqual({ owner: "group/sub", repo: "repo" });
    expect(parseRepoUrl("git@gitlab.com:group/sub/repo.git")).toEqual({ owner: "group/sub", repo: "repo" });
    expect(parseRepoUrl("https://gitlab.com/group/sub/repo/-/tree/main")).toEqual({ owner: "group/sub", repo: "repo" });
  });
  it("parses a plain owner/repo", () => {
    expect(parseRepoUrl("https://github.com/o/r")).toEqual({ owner: "o", repo: "r" });
    expect(parseRepoUrl("git@github.com:o/r.git")).toEqual({ owner: "o", repo: "r" });
  });
});
