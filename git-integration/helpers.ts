import { APIError } from "encore.dev/api";

export function throwProviderError(provider: string, status: number, statusText: string): never {
  const msg = `${provider} API error: ${status} ${statusText}`;
  if (status === 401) throw APIError.unauthenticated(`${provider} token is invalid or expired. Please update your connection.`);
  if (status === 403) throw APIError.permissionDenied(`${provider} token lacks required permissions. ${statusText}`);
  if (status === 404) throw APIError.notFound(`${provider} resource not found. ${statusText}`);
  throw APIError.internal(msg);
}

export function parseRepoUrl(url: string): { baseUrl: string; owner: string; repo: string } | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (parts.length < 2) return null;
    return { baseUrl: `${u.protocol}//${u.host}`, owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}
