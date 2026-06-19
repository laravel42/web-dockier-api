export interface Dependency {
  name: string;
  version: string;
  type: "production" | "dev";
  ecosystem: "npm" | "composer" | "pip" | "gem" | "go" | "cargo";
  repoUrl: string;
  latestVersion?: string;
  status: "active" | "outdated" | "deprecated" | "unknown";
  vulnerabilities: Array<{
    id: string;
    severity: "critical" | "high" | "medium" | "low";
    title: string;
    details: string;
    aliases: string[];
    url: string;
  }>;
}

interface OsvReference {
  type?: string;
  url?: string;
}

interface OsvVulnerability {
  id?: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  references?: OsvReference[];
}

// `range` preserves the raw constraint (e.g. "^1.2.3") so outdated detection can
// honor caret/tilde/wildcard ranges instead of comparing the literal version.
type ParsedDep = Omit<Dependency, "latestVersion" | "status" | "vulnerabilities"> & { range: string };

// ─── Semver range evaluation ───

type SemVer = [number, number, number];

function toSemVer(value: string): SemVer | null {
  const match = value.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1] ?? 0), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function cleanVersion(raw: string): string {
  const match = raw.match(/\d+(?:\.\d+){0,2}/);
  return match ? match[0] : raw.replace(/^[\s^~>=<]*/, "").trim();
}

function compareSemVer(a: SemVer, b: SemVer): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function caretUpper([major, minor, patch]: SemVer): SemVer {
  if (major > 0) return [major + 1, 0, 0];
  if (minor > 0) return [0, minor + 1, 0];
  return [0, 0, patch + 1];
}

function comparatorSatisfied(token: string, latest: SemVer): boolean {
  const trimmed = token.trim().replace(/@.*$/, ""); // drop composer stability flags (e.g. "@dev")
  if (!trimmed || trimmed === "*" || /^x$/i.test(trimmed)) return true;

  const match = trimmed.match(/^(\^|~|>=|<=|>|<|=)?\s*v?(.+)$/);
  if (!match) return true;
  const op = match[1] ?? "=";
  const versionStr = match[2].trim();
  const base = toSemVer(versionStr);
  if (!base) return true;

  switch (op) {
    case ">=": return compareSemVer(latest, base) >= 0;
    case ">":  return compareSemVer(latest, base) > 0;
    case "<=": return compareSemVer(latest, base) <= 0;
    case "<":  return compareSemVer(latest, base) < 0;
    case "^":  return compareSemVer(latest, base) >= 0 && compareSemVer(latest, caretUpper(base)) < 0;
    case "~": {
      const components = versionStr.split(".").filter((p) => p !== "" && p !== "*" && !/^x$/i.test(p)).length;
      const upper: SemVer = components >= 2 ? [base[0], base[1] + 1, 0] : [base[0] + 1, 0, 0];
      return compareSemVer(latest, base) >= 0 && compareSemVer(latest, upper) < 0;
    }
    default: {
      // Exact, partial, or wildcard (e.g. "1.2.3", "1.2", "1.2.*", "5.7.x")
      const explicit = versionStr.split(".").filter((p) => p !== "" && p !== "*" && !/^x$/i.test(p)).length;
      const isWildcard = /[*x]/i.test(versionStr) || explicit < 3;
      if (!isWildcard) return compareSemVer(latest, base) === 0;
      const upper: SemVer = explicit <= 1 ? [base[0] + 1, 0, 0] : [base[0], base[1] + 1, 0];
      return compareSemVer(latest, base) >= 0 && compareSemVer(latest, upper) < 0;
    }
  }
}

// True when the latest published version is reachable by the declared constraint,
// i.e. a fresh `npm/composer install` would already pull it (so it's not outdated).
function rangeAllowsLatest(range: string, latest: SemVer): boolean {
  const orGroups = range.split(/\s*\|\|?\s*/).filter(Boolean);
  if (orGroups.length === 0) return true;
  return orGroups.some((group) =>
    group
      .split(/[\s,]+/)
      .filter(Boolean)
      .every((token) => comparatorSatisfied(token, latest)),
  );
}

function parsePackageJson(content: string): ParsedDep[] {
  try {
    const parsed = JSON.parse(content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps: ParsedDep[] = [];
    for (const [name, version] of Object.entries(parsed.dependencies ?? {})) {
      const raw = String(version);
      deps.push({ name, version: cleanVersion(raw), range: raw, type: "production", ecosystem: "npm", repoUrl: `https://www.npmjs.com/package/${name}` });
    }
    for (const [name, version] of Object.entries(parsed.devDependencies ?? {})) {
      const raw = String(version);
      deps.push({ name, version: cleanVersion(raw), range: raw, type: "dev", ecosystem: "npm", repoUrl: `https://www.npmjs.com/package/${name}` });
    }
    return deps;
  } catch {
    return [];
  }
}

function parseComposerJson(content: string): ParsedDep[] {
  try {
    const parsed = JSON.parse(content) as { require?: Record<string, string>; "require-dev"?: Record<string, string> };
    const deps: ParsedDep[] = [];
    for (const [name, version] of Object.entries(parsed.require ?? {})) {
      if (name === "php" || name.startsWith("ext-")) continue;
      const raw = String(version);
      deps.push({ name, version: cleanVersion(raw), range: raw, type: "production", ecosystem: "composer", repoUrl: `https://packagist.org/packages/${name}` });
    }
    for (const [name, version] of Object.entries(parsed["require-dev"] ?? {})) {
      const raw = String(version);
      deps.push({ name, version: cleanVersion(raw), range: raw, type: "dev", ecosystem: "composer", repoUrl: `https://packagist.org/packages/${name}` });
    }
    return deps;
  } catch {
    return [];
  }
}

function parseRequirementsTxt(content: string): ParsedDep[] {
  const deps: ParsedDep[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*(.*)$/);
    if (!match) continue;
    const spec = match[2].trim();
    deps.push({ name: match[1], version: spec ? cleanVersion(spec) : "*", range: spec || "*", type: "production", ecosystem: "pip", repoUrl: `https://pypi.org/project/${match[1]}` });
  }
  return deps;
}

async function fetchLatestVersions(deps: Array<{ name: string; ecosystem: string }>): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  await Promise.all(
    deps.map(async (dep) => {
      const key = `${dep.ecosystem}:${dep.name}`;
      try {
        if (dep.ecosystem === "npm") {
          const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(dep.name)}/latest`, { signal: AbortSignal.timeout(5000) });
          if (!response.ok) return;
          const data = (await response.json()) as { version?: string };
          if (data.version) result.set(key, data.version);
        } else if (dep.ecosystem === "composer") {
          const response = await fetch(`https://repo.packagist.org/p2/${dep.name}.json`, { signal: AbortSignal.timeout(5000) });
          if (!response.ok) return;
          const data = (await response.json()) as { packages?: Record<string, Array<{ version?: string }>> };
          const versions = data.packages?.[dep.name] ?? [];
          const stable = versions.find((entry) => !entry.version?.includes("dev"));
          if (stable?.version) result.set(key, stable.version.replace(/^v/, ""));
        } else if (dep.ecosystem === "pip") {
          const response = await fetch(`https://pypi.org/pypi/${encodeURIComponent(dep.name)}/json`, { signal: AbortSignal.timeout(5000) });
          if (!response.ok) return;
          const data = (await response.json()) as { info?: { version?: string } };
          if (data.info?.version) result.set(key, data.info.version);
        }
      } catch {
        // Ignore transient registry/network issues.
      }
    }),
  );
  return result;
}

async function checkVulnerabilities(deps: ParsedDep[]): Promise<Dependency[]> {
  const ecosystemMap: Record<string, string> = { npm: "npm", composer: "Packagist", pip: "PyPI", gem: "RubyGems", go: "Go", cargo: "crates.io" };
  const queries = deps.map((dep) => ({
    package: { name: dep.name, ecosystem: ecosystemMap[dep.ecosystem] || dep.ecosystem },
    version: dep.version.replace(/\*/g, "0.0.0"),
  }));

  let results: Array<{ vulns?: OsvVulnerability[] }> = [];
  try {
    const response = await fetch("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries }),
    });
    const body = (await response.json()) as { results?: Array<{ vulns?: OsvVulnerability[] }> };
    results = body.results ?? [];
  } catch {
    results = queries.map(() => ({}));
  }

  const latest = await fetchLatestVersions(deps);
  return deps.map((dep, index) => {
    const vulnerabilities = (results[index]?.vulns ?? []).slice(0, 10).map((vuln) => ({
      id: vuln.id ?? "unknown",
      severity: "medium" as const,
      title: vuln.summary ?? vuln.id ?? "Unknown vulnerability",
      details: vuln.details ?? "",
      aliases: vuln.aliases ?? [],
      url: vuln.references?.find((ref) => ref.type === "WEB")?.url ?? `https://osv.dev/vulnerability/${vuln.id ?? ""}`,
    }));
    const latestVersion = latest.get(`${dep.ecosystem}:${dep.name}`);
    const latestSv = latestVersion ? toSemVer(latestVersion) : null;
    const baseSv = toSemVer(dep.version);
    // Outdated only when the latest release is strictly newer AND falls outside
    // the declared range (so "^1.2.3" with latest "1.9.0" stays "active").
    const isNewer = latestSv && baseSv ? compareSemVer(latestSv, baseSv) > 0 : false;
    const allowsLatest = latestSv ? rangeAllowsLatest(dep.range || dep.version, latestSv) : true;
    const isOutdated = !!latestVersion && dep.version !== "*" && isNewer && !allowsLatest;
    const { range: _range, ...rest } = dep;
    return {
      ...rest,
      latestVersion,
      status: isOutdated ? "outdated" : "active",
      vulnerabilities,
    };
  });
}

export async function scanDependencies(configFiles: Record<string, string>): Promise<Dependency[]> {
  let deps: ParsedDep[] = [];
  for (const [path, content] of Object.entries(configFiles)) {
    const lower = path.toLowerCase();
    if (lower.endsWith("package.json")) deps = deps.concat(parsePackageJson(content));
    if (lower.endsWith("composer.json")) deps = deps.concat(parseComposerJson(content));
    if (lower.endsWith("requirements.txt")) deps = deps.concat(parseRequirementsTxt(content));
  }
  const seen = new Set<string>();
  deps = deps.filter((dep) => {
    const key = `${dep.ecosystem}:${dep.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (deps.length === 0) return [];
  return checkVulnerabilities(deps);
}
