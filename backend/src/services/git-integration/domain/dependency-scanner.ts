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

function parsePackageJson(content: string): Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> {
  try {
    const parsed = JSON.parse(content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps: Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> = [];
    for (const [name, version] of Object.entries(parsed.dependencies ?? {})) {
      deps.push({ name, version: String(version).replace(/^[\^~>=<]*/g, ""), type: "production", ecosystem: "npm", repoUrl: `https://www.npmjs.com/package/${name}` });
    }
    for (const [name, version] of Object.entries(parsed.devDependencies ?? {})) {
      deps.push({ name, version: String(version).replace(/^[\^~>=<]*/g, ""), type: "dev", ecosystem: "npm", repoUrl: `https://www.npmjs.com/package/${name}` });
    }
    return deps;
  } catch {
    return [];
  }
}

function parseComposerJson(content: string): Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> {
  try {
    const parsed = JSON.parse(content) as { require?: Record<string, string>; "require-dev"?: Record<string, string> };
    const deps: Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> = [];
    for (const [name, version] of Object.entries(parsed.require ?? {})) {
      if (name === "php" || name.startsWith("ext-")) continue;
      deps.push({ name, version: String(version).replace(/^[\^~>=<]*/g, ""), type: "production", ecosystem: "composer", repoUrl: `https://packagist.org/packages/${name}` });
    }
    for (const [name, version] of Object.entries(parsed["require-dev"] ?? {})) {
      deps.push({ name, version: String(version).replace(/^[\^~>=<]*/g, ""), type: "dev", ecosystem: "composer", repoUrl: `https://packagist.org/packages/${name}` });
    }
    return deps;
  } catch {
    return [];
  }
}

function parseRequirementsTxt(content: string): Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> {
  const deps: Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*(?:[=<>!~]+\s*(.+))?$/);
    if (!match) continue;
    deps.push({ name: match[1], version: match[2] || "*", type: "production", ecosystem: "pip", repoUrl: `https://pypi.org/project/${match[1]}` });
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

async function checkVulnerabilities(deps: Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">>): Promise<Dependency[]> {
  const ecosystemMap: Record<string, string> = { npm: "npm", composer: "Packagist", pip: "PyPI", gem: "RubyGems", go: "Go", cargo: "crates.io" };
  const queries = deps.map((dep) => ({
    package: { name: dep.name, ecosystem: ecosystemMap[dep.ecosystem] || dep.ecosystem },
    version: dep.version.replace(/\*/g, "0.0.0"),
  }));

  let results: Array<{ vulns?: Array<any> }> = [];
  try {
    const response = await fetch("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries }),
    });
    const body = (await response.json()) as { results?: Array<{ vulns?: Array<any> }> };
    results = body.results ?? [];
  } catch {
    results = queries.map(() => ({}));
  }

  const latest = await fetchLatestVersions(deps);
  return deps.map((dep, index) => {
    const vulnerabilities = (results[index]?.vulns ?? []).slice(0, 10).map((vuln: any) => ({
      id: vuln.id ?? "unknown",
      severity: "medium" as const,
      title: vuln.summary ?? vuln.id ?? "Unknown vulnerability",
      details: vuln.details ?? "",
      aliases: vuln.aliases ?? [],
      url: vuln.references?.find((ref: any) => ref.type === "WEB")?.url ?? `https://osv.dev/vulnerability/${vuln.id ?? ""}`,
    }));
    const latestVersion = latest.get(`${dep.ecosystem}:${dep.name}`);
    const isOutdated = latestVersion && dep.version !== "*" && dep.version !== latestVersion;
    return {
      ...dep,
      latestVersion,
      status: isOutdated ? "outdated" : "active",
      vulnerabilities,
    };
  });
}

export async function scanDependencies(configFiles: Record<string, string>): Promise<Dependency[]> {
  let deps: Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> = [];
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
