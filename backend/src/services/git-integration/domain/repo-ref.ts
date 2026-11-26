/**
 * Kept in its own module, with no imports, so it is testable without
 * initialising config — the worker that uses it pulls in the Supabase client,
 * which reads env at load time.
 */

/** Throws when `repository` is not a URL, which is how the caller detects that. */
function urlPathname(repository: string): string {
  return new URL(repository).pathname.replace(/^\//, "").replace(/\.git$/, "");
}

function ownerRepoFromParts(path: string): { owner: string; repo: string } | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return { owner: parts.slice(0, -1).join("/"), repo: parts[parts.length - 1]! };
}

/**
 * Mirror of the frontend's `parseOwnerRepo` (utils/parseOwnerRepo.ts).
 *
 * It has to agree with it exactly: the frontend derives the `repo` query param
 * for the badge route from that function, and that value keys the analysis_cache
 * row the route looks up. A different shape here writes a row nothing reads.
 * Everything past the last slash is the repo, so a GitLab nested group keeps its
 * full path as the owner.
 */
export function parseRepositoryRef(repository: string): { owner: string; repo: string } | null {
  const ssh = repository.match(/^[\w-]+@[^:]+:(.+?)(?:\.git)?$/);
  if (ssh) {
    const fromSsh = ownerRepoFromParts(ssh[1]!);
    if (fromSsh) return fromSsh;
  }
  try {
    // Once it parses as a URL, only its path can hold owner/repo. The frontend
    // falls through to splitting the whole string here, which turns a URL with
    // one path segment into owner "https:/github.com" — a key no analysis can
    // use. The divergence is safe: both produce something unusable, and
    // returning null means the worker logs and skips instead of walking it.
    return ownerRepoFromParts(urlPathname(repository));
  } catch {
    /* not a URL — fall through to the bare owner/repo form */
  }
  return ownerRepoFromParts(repository.replace(/\.git$/, ""));
}
