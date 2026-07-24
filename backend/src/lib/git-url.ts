/**
 * Build an authenticated git clone URL for a given provider.
 *
 * Supports GitHub, GitLab (cloud + self-hosted), and Bitbucket.
 * Falls back to a public GitHub URL when no token is provided.
 *
 * Tokens are URI-encoded to prevent URL injection if a token contains
 * special characters (@, :, /, etc.) that have structural meaning in URLs.
 */
export function buildCloneUrl(opts: {
  provider: string;
  token: string;
  repo: string;
  endpoint?: string;
}): string {
  const { provider, token, repo, endpoint } = opts;

  if (!token) {
    return `https://github.com/${repo}.git`;
  }

  const encodedToken = encodeURIComponent(token);

  switch (provider) {
    case "github":
      return `https://x-access-token:${encodedToken}@github.com/${repo}.git`;

    case "gitlab":
    case "gitlab_self_hosted": {
      const host = new URL(endpoint || "https://gitlab.com").host;
      return `https://oauth2:${encodedToken}@${host}/${repo}.git`;
    }

    case "bitbucket":
      return `https://x-token-auth:${encodedToken}@bitbucket.org/${repo}.git`;

    default:
      throw new Error(`Unsupported git provider: ${provider}`);
  }
}
