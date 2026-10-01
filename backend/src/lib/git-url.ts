/**
 * Build a git clone URL for a given provider.
 *
 * Supports GitHub, GitLab (cloud + self-hosted), and Bitbucket.
 *
 * Tokens are URI-encoded to prevent URL injection if a token contains
 * special characters (@, :, /, etc.) that have structural meaning in URLs.
 */

/** Host and basic-auth username for each supported provider. */
function resolveProvider(provider: string, endpoint?: string): { host: string; user: string } {
  switch (provider) {
    case "github":
      // Endpoint is intentionally ignored: GitHub Enterprise is not supported here.
      return { host: "github.com", user: "x-access-token" };

    case "gitlab":
    case "gitlab_self_hosted":
      return { host: hostFromEndpoint(endpoint, "gitlab.com"), user: "oauth2" };

    case "bitbucket":
      return { host: "bitbucket.org", user: "x-token-auth" };

    default:
      throw new Error(`Unsupported git provider: ${provider}`);
  }
}

/**
 * Extract the host from a provider endpoint, falling back when absent.
 *
 * A malformed endpoint used to reach `new URL()` unguarded and surface as a
 * raw TypeError ("Invalid URL"), which told the user nothing about which
 * setting was wrong.
 */
function hostFromEndpoint(endpoint: string | undefined, fallback: string): string {
  if (!endpoint) return fallback;
  try {
    return new URL(endpoint).host;
  } catch {
    throw new Error(
      `Invalid git provider endpoint: "${endpoint}". Expected a full URL including the scheme, e.g. https://gitlab.example.com`,
    );
  }
}

export function buildCloneUrl(opts: {
  provider: string;
  token: string;
  repo: string;
  endpoint?: string;
}): string {
  const { provider, token, repo, endpoint } = opts;

  // Resolve the provider first. Returning early on an empty token used to
  // short-circuit this, so a tokenless GitLab or Bitbucket repo was handed a
  // github.com URL and the unsupported-provider error was unreachable.
  const { host, user } = resolveProvider(provider, endpoint);

  if (!token) {
    return `https://${host}/${repo}.git`;
  }

  return `https://${user}:${encodeURIComponent(token)}@${host}/${repo}.git`;
}
