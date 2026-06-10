/**
 * Build an authenticated git clone URL for a given provider.
 *
 * Supports GitHub, GitLab (cloud + self-hosted), and Bitbucket.
 * Falls back to a public GitHub URL when no token is provided.
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

  switch (provider) {
    case "github":
      return `https://x-access-token:${token}@github.com/${repo}.git`;

    case "gitlab":
    case "gitlab_self_hosted": {
      const host = new URL(endpoint || "https://gitlab.com").host;
      return `https://oauth2:${token}@${host}/${repo}.git`;
    }

    case "bitbucket":
      return `https://x-token-auth:${token}@bitbucket.org/${repo}.git`;

    default:
      throw new Error(`Unsupported git provider: ${provider}`);
  }
}
