/**
 * Authenticated Clone URL Builder — Unit Tests
 *
 * These tests pin EXISTING behaviour, including two rough edges documented
 * inline: the empty-token fallback ignores the provider, and a non-URL
 * `endpoint` throws out of `new URL()`.
 */

import { describe, it, expect } from "vitest";
import { buildCloneUrl } from "../git-url.js";

const REPO = "acme/app";
const TOKEN = "tok123";

describe("buildCloneUrl — github", () => {
  it("embeds the token as the x-access-token user", () => {
    expect(buildCloneUrl({ provider: "github", token: TOKEN, repo: REPO })).toBe(
      `https://x-access-token:${TOKEN}@github.com/${REPO}.git`,
    );
  });

  it("ignores endpoint for github", () => {
    expect(buildCloneUrl({ provider: "github", token: TOKEN, repo: REPO, endpoint: "https://ghe.acme.dev" })).toBe(
      `https://x-access-token:${TOKEN}@github.com/${REPO}.git`,
    );
  });
});

describe("buildCloneUrl — gitlab", () => {
  it("uses the oauth2 user and the gitlab.com host", () => {
    expect(buildCloneUrl({ provider: "gitlab", token: TOKEN, repo: REPO })).toBe(
      `https://oauth2:${TOKEN}@gitlab.com/${REPO}.git`,
    );
  });

  it("honours an endpoint even for the cloud provider key", () => {
    expect(buildCloneUrl({ provider: "gitlab", token: TOKEN, repo: REPO, endpoint: "https://git.acme.dev" })).toBe(
      `https://oauth2:${TOKEN}@git.acme.dev/${REPO}.git`,
    );
  });

  it("supports a nested group path", () => {
    expect(buildCloneUrl({ provider: "gitlab", token: TOKEN, repo: "group/sub/app" })).toBe(
      `https://oauth2:${TOKEN}@gitlab.com/group/sub/app.git`,
    );
  });
});

describe("buildCloneUrl — gitlab_self_hosted", () => {
  it("uses the host from a custom endpoint", () => {
    expect(
      buildCloneUrl({ provider: "gitlab_self_hosted", token: TOKEN, repo: REPO, endpoint: "https://git.acme.dev" }),
    ).toBe(`https://oauth2:${TOKEN}@git.acme.dev/${REPO}.git`);
  });

  it("keeps a non-default port in the host", () => {
    expect(
      buildCloneUrl({ provider: "gitlab_self_hosted", token: TOKEN, repo: REPO, endpoint: "https://git.acme.dev:8443" }),
    ).toBe(`https://oauth2:${TOKEN}@git.acme.dev:8443/${REPO}.git`);
  });

  it("drops the endpoint's path and scheme, keeping only the host", () => {
    expect(
      buildCloneUrl({
        provider: "gitlab_self_hosted",
        token: TOKEN,
        repo: REPO,
        endpoint: "http://git.acme.dev/api/v4",
      }),
    ).toBe(`https://oauth2:${TOKEN}@git.acme.dev/${REPO}.git`);
  });

  it("falls back to gitlab.com when endpoint is absent", () => {
    expect(buildCloneUrl({ provider: "gitlab_self_hosted", token: TOKEN, repo: REPO })).toBe(
      `https://oauth2:${TOKEN}@gitlab.com/${REPO}.git`,
    );
  });

  it("falls back to gitlab.com when endpoint is an empty string", () => {
    expect(buildCloneUrl({ provider: "gitlab_self_hosted", token: TOKEN, repo: REPO, endpoint: "" })).toBe(
      `https://oauth2:${TOKEN}@gitlab.com/${REPO}.git`,
    );
  });

  // NOTE: suspected bug — a malformed endpoint reaches `new URL()` unguarded, so
  // a misconfigured connection surfaces as a raw TypeError ("Invalid URL")
  // instead of a user-facing message. Asserted as today's behaviour.
  it("throws a raw URL parse error for a non-URL endpoint", () => {
    expect(() =>
      buildCloneUrl({ provider: "gitlab_self_hosted", token: TOKEN, repo: REPO, endpoint: "not a url" }),
    ).toThrow(TypeError);
  });

  it("throws for an endpoint missing its scheme", () => {
    expect(() =>
      buildCloneUrl({ provider: "gitlab_self_hosted", token: TOKEN, repo: REPO, endpoint: "git.acme.dev" }),
    ).toThrow();
  });
});

describe("buildCloneUrl — bitbucket", () => {
  it("uses the x-token-auth user and the bitbucket.org host", () => {
    expect(buildCloneUrl({ provider: "bitbucket", token: TOKEN, repo: REPO })).toBe(
      `https://x-token-auth:${TOKEN}@bitbucket.org/${REPO}.git`,
    );
  });
});

describe("buildCloneUrl — token handling", () => {
  it("URI-encodes characters with structural meaning in a URL", () => {
    expect(buildCloneUrl({ provider: "github", token: "a@b:c/d?e", repo: REPO })).toBe(
      `https://x-access-token:a%40b%3Ac%2Fd%3Fe@github.com/${REPO}.git`,
    );
  });

  it("encodes a token containing a '#' so it cannot truncate the URL", () => {
    expect(buildCloneUrl({ provider: "gitlab", token: "a#b", repo: REPO })).toBe(
      `https://oauth2:a%23b@gitlab.com/${REPO}.git`,
    );
  });

  it("leaves an alphanumeric token untouched", () => {
    expect(buildCloneUrl({ provider: "bitbucket", token: "abc123", repo: REPO })).toContain("x-token-auth:abc123@");
  });
});

describe("buildCloneUrl — no token", () => {
  it("falls back to a public GitHub URL", () => {
    expect(buildCloneUrl({ provider: "github", token: "", repo: REPO })).toBe(`https://github.com/${REPO}.git`);
  });

  // NOTE: suspected bug — the empty-token branch runs before the provider
  // switch, so a tokenless GitLab or Bitbucket repo is cloned from github.com.
  // Asserted as today's behaviour.
  it("returns a GitHub URL even for non-GitHub providers", () => {
    expect(buildCloneUrl({ provider: "gitlab", token: "", repo: REPO })).toBe(`https://github.com/${REPO}.git`);
    expect(buildCloneUrl({ provider: "bitbucket", token: "", repo: REPO })).toBe(`https://github.com/${REPO}.git`);
  });

  // Same branch: an unsupported provider with no token never reaches the throw.
  it("does not throw for an unsupported provider when the token is empty", () => {
    expect(buildCloneUrl({ provider: "svn", token: "", repo: REPO })).toBe(`https://github.com/${REPO}.git`);
  });
});

describe("buildCloneUrl — unsupported provider", () => {
  it("throws a descriptive error naming the provider", () => {
    expect(() => buildCloneUrl({ provider: "svn", token: TOKEN, repo: REPO })).toThrow(
      "Unsupported git provider: svn",
    );
  });

  it("throws for a provider differing only in case", () => {
    expect(() => buildCloneUrl({ provider: "GitHub", token: TOKEN, repo: REPO })).toThrow(
      "Unsupported git provider: GitHub",
    );
  });
});
