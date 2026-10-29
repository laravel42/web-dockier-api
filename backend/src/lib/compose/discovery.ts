/**
 * Finding the compose file(s) in a repository.
 *
 * Deliberately a whole-tree scan rather than a root probe. The repo this
 * feature was designed against keeps none of its compose files at the root and
 * has three of them:
 *
 *   deploy/dokploy/docker-compose.yml   ← the one meant for Dokploy
 *   deploy/local/docker-compose.yml
 *   deploy/aws/host/compose.yml
 *
 * So "is there a compose file" is not a yes/no at a fixed path, and picking one
 * is a ranking problem. The ranking only supplies a DEFAULT — the user chooses,
 * because nothing in a filename can prove which environment a file targets.
 */

/** Filenames Compose itself recognises, plus the `.yaml` spellings. */
const COMPOSE_FILENAMES = [
  "compose.yaml",
  "compose.yml",
  "docker-compose.yaml",
  "docker-compose.yml",
];

/**
 * Directory segments that mark a compose file as NOT a deploy target. A
 * local-development or CI stack usually binds source directories and exposes
 * host ports, so deploying it produces a broken service rather than a failure
 * anyone can read.
 */
const NON_DEPLOY_HINTS = ["local", "dev", "development", "test", "testing", "ci", "example", "examples"];

export interface ComposeCandidate {
  /** Repo-root-relative path, e.g. "deploy/dokploy/docker-compose.yml". */
  path: string;
  /** Repo-root-relative directory holding it ("" for the repo root). */
  dir: string;
  /** Why it was ranked where it was — shown in the wizard, not just for debugging. */
  reason: string;
}

/**
 * Every compose file in the tree, best default first.
 *
 * Ranking, in order:
 *   1. A path mentioning "dokploy" — written for this platform specifically.
 *   2. The repo root — Compose's own default location.
 *   3. A path mentioning "deploy" or "prod" without a local/dev/CI marker.
 *   4. Everything else, shallowest first.
 * Local/dev/test/CI paths sort last whatever else they match.
 */
export function findComposeFiles(treePaths: string[]): ComposeCandidate[] {
  const candidates: Array<ComposeCandidate & { rank: number; depth: number }> = [];

  for (const raw of treePaths) {
    const path = raw.replace(/^\.\//, "");
    const slash = path.lastIndexOf("/");
    const filename = slash === -1 ? path : path.slice(slash + 1);
    if (!COMPOSE_FILENAMES.includes(filename.toLowerCase())) continue;

    const dir = slash === -1 ? "" : path.slice(0, slash);
    const segments = dir.toLowerCase().split("/").filter(Boolean);
    const isNonDeploy = segments.some((s) => NON_DEPLOY_HINTS.includes(s));

    let rank: number;
    let reason: string;
    if (isNonDeploy) {
      rank = 4;
      reason = "Looks like a local or CI stack rather than a deploy target.";
    } else if (segments.includes("dokploy")) {
      rank = 0;
      reason = "Written for Dokploy.";
    } else if (dir === "") {
      rank = 1;
      reason = "Compose's default location.";
    } else if (segments.some((s) => s === "deploy" || s.startsWith("prod"))) {
      rank = 2;
      reason = "Looks like a deployment stack.";
    } else {
      rank = 3;
      reason = "Found in the repository.";
    }

    candidates.push({ path, dir, reason, rank, depth: segments.length });
  }

  candidates.sort((a, b) => a.rank - b.rank || a.depth - b.depth || a.path.localeCompare(b.path));

  return candidates.map(({ path, dir, reason }) => ({ path, dir, reason }));
}
