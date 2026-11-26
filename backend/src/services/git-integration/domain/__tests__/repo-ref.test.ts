import { describe, expect, it } from "vitest";
import { parseRepositoryRef } from "../repo-ref.js";

/**
 * `owner/repo` derived here keys the analysis_cache row, and the badge route
 * looks that row up with the key the FRONTEND derives from the same URL via
 * utils/parseOwnerRepo.ts. The two must agree or the worker writes a row no
 * read path ever finds, and the fan-out it exists to prevent comes back.
 *
 * The cases below are the shapes parseOwnerRepo handles.
 */
describe("parseRepositoryRef", () => {
  it("reads an https url", () => {
    expect(parseRepositoryRef("https://github.com/laravel42/web-dockier-api")).toEqual({
      owner: "laravel42",
      repo: "web-dockier-api",
    });
  });

  it("drops a .git suffix", () => {
    expect(parseRepositoryRef("https://github.com/acme/site.git")).toEqual({
      owner: "acme",
      repo: "site",
    });
  });

  it("reads an ssh remote", () => {
    expect(parseRepositoryRef("git@github.com:acme/site.git")).toEqual({
      owner: "acme",
      repo: "site",
    });
  });

  it("keeps a GitLab nested group as the owner", () => {
    expect(parseRepositoryRef("https://gitlab.com/group/subgroup/app")).toEqual({
      owner: "group/subgroup",
      repo: "app",
    });
  });

  it("accepts a bare owner/repo, which is what the cache key looks like", () => {
    expect(parseRepositoryRef("acme/site")).toEqual({ owner: "acme", repo: "site" });
  });

  it("ignores a trailing slash rather than reading an empty repo name", () => {
    expect(parseRepositoryRef("https://github.com/acme/site/")).toEqual({
      owner: "acme",
      repo: "site",
    });
  });

  it("returns null when there is no owner to find", () => {
    expect(parseRepositoryRef("https://github.com/acme")).toBeNull();
    expect(parseRepositoryRef("site")).toBeNull();
    expect(parseRepositoryRef("")).toBeNull();
  });
});
