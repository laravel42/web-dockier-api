/**
 * Dependency scanner — parses package manifests and checks for vulnerabilities
 * using public APIs (no AI needed).
 */

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

// ─── Parse package manifests ───

function parsePackageJson(content: string): Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> {
  try {
    const pkg = JSON.parse(content);
    const deps: Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> = [];
    for (const [name, ver] of Object.entries(pkg.dependencies || {})) {
      deps.push({ name, version: String(ver).replace(/^[\^~>=<]*/g, ""), type: "production", ecosystem: "npm", repoUrl: `https://www.npmjs.com/package/${name}` });
    }
    for (const [name, ver] of Object.entries(pkg.devDependencies || {})) {
      deps.push({ name, version: String(ver).replace(/^[\^~>=<]*/g, ""), type: "dev", ecosystem: "npm", repoUrl: `https://www.npmjs.com/package/${name}` });
    }
    return deps;
  } catch { return []; }
}

function parseComposerJson(content: string): Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> {
  try {
    const pkg = JSON.parse(content);
    const deps: Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> = [];
    for (const [name, ver] of Object.entries(pkg.require || {})) {
      if (name === "php" || name.startsWith("ext-")) continue;
      deps.push({ name, version: String(ver).replace(/^[\^~>=<]*/g, ""), type: "production", ecosystem: "composer", repoUrl: `https://packagist.org/packages/${name}` });
    }
    for (const [name, ver] of Object.entries(pkg["require-dev"] || {})) {
      deps.push({ name, version: String(ver).replace(/^[\^~>=<]*/g, ""), type: "dev", ecosystem: "composer", repoUrl: `https://packagist.org/packages/${name}` });
    }
    return deps;
  } catch { return []; }
}

function parseRequirementsTxt(content: string): Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> {
  const deps: Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
    const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*(?:[=<>!~]+\s*(.+))?$/);
    if (match) {
      deps.push({ name: match[1], version: match[2] || "*", type: "production", ecosystem: "pip", repoUrl: `https://pypi.org/project/${match[1]}` });
    }
  }
  return deps;
}

function parseGemfile(content: string): Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> {
  const deps: Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> = [];
  const gemRegex = /gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/g;
  let m;
  while ((m = gemRegex.exec(content)) !== null) {
    deps.push({ name: m[1], version: m[2]?.replace(/^[\^~>=<]*/g, "") || "*", type: "production", ecosystem: "gem", repoUrl: `https://rubygems.org/gems/${m[1]}` });
  }
  return deps;
}

// ─── Check vulnerabilities via OSV.dev (free, no API key) ───

async function checkVulnerabilities(deps: Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">>): Promise<Dependency[]> {
  const ecosystemMap: Record<string, string> = {
    npm: "npm", composer: "Packagist", pip: "PyPI", gem: "RubyGems", go: "Go", cargo: "crates.io",
  };

  // Batch query OSV.dev (max 1000 per request)
  const queries = deps.map(d => ({
    package: { name: d.name, ecosystem: ecosystemMap[d.ecosystem] || d.ecosystem },
    version: d.version.replace(/\*/g, "0.0.0"),
  }));

  let vulnResults: Array<{ vulns?: Array<{ id: string; summary: string; details?: string; aliases?: string[]; severity?: Array<{ type: string; score: string }>; references?: Array<{ type: string; url: string }> }> }> = [];

  try {
    // OSV batch query
    const batchSize = 100;
    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      const res = await fetch("https://api.osv.dev/v1/querybatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries: batch }),
      });
      if (res.ok) {
        const data = await res.json() as { results: typeof vulnResults };
        vulnResults.push(...(data.results || []));
      } else {
        // Fill with empty results for this batch
        vulnResults.push(...batch.map(() => ({ vulns: undefined })));
      }
    }
  } catch {
    vulnResults = queries.map(() => ({ vulns: undefined }));
  }

  // Fetch latest versions in parallel with vulnerability check
  const latestVersions = await fetchLatestVersions(deps);

  return deps.map((d, i) => {
    const vulns = vulnResults[i]?.vulns || [];
    const vulnerabilities = vulns.slice(0, 10).map(v => {
      const cvssScore = v.severity?.find(s => s.type === "CVSS_V3")?.score;
      let severity: "critical" | "high" | "medium" | "low" = "medium";
      if (cvssScore) {
        const score = parseFloat(cvssScore);
        if (score >= 9) severity = "critical";
        else if (score >= 7) severity = "high";
        else if (score >= 4) severity = "medium";
        else severity = "low";
      }
      const url = v.references?.find(r => r.type === "ADVISORY")?.url
        || v.references?.find(r => r.type === "WEB")?.url
        || `https://osv.dev/vulnerability/${v.id}`;
      return { id: v.id, severity, title: v.summary || v.id, details: v.details || "", aliases: v.aliases || [], url };
    });

    const latestVersion = latestVersions.get(`${d.ecosystem}:${d.name}`);
    const isOutdated = latestVersion && d.version !== "*" && latestVersion !== d.version;
    const status: Dependency["status"] = vulnerabilities.some(v => v.severity === "critical" || v.severity === "high")
      ? "outdated" : isOutdated ? "outdated" : "active";

    return { ...d, latestVersion: latestVersion || undefined, status, vulnerabilities };
  });
}

// ─── Fetch latest versions from registries ───

async function fetchLatestVersions(deps: Array<{ name: string; ecosystem: string }>): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  const fetches = deps.map(async (d) => {
    const key = `${d.ecosystem}:${d.name}`;
    try {
      if (d.ecosystem === "npm") {
        const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(d.name)}/latest`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json() as any;
          if (data.version) results.set(key, data.version);
        }
      } else if (d.ecosystem === "composer") {
        const res = await fetch(`https://repo.packagist.org/p2/${d.name}.json`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json() as any;
          const versions = data.packages?.[d.name] || [];
          const stable = versions.find((v: any) => !v.version?.includes("dev") && !v.version?.includes("alpha") && !v.version?.includes("beta") && !v.version?.includes("RC"));
          if (stable?.version) results.set(key, stable.version.replace(/^v/, ""));
        }
      } else if (d.ecosystem === "pip") {
        const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(d.name)}/json`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json() as any;
          if (data.info?.version) results.set(key, data.info.version);
        }
      } else if (d.ecosystem === "gem") {
        const res = await fetch(`https://rubygems.org/api/v1/gems/${encodeURIComponent(d.name)}.json`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json() as any;
          if (data.version) results.set(key, data.version);
        }
      }
    } catch { /* timeout or network error — skip */ }
  });

  // Run in batches of 10 to avoid overwhelming registries
  for (let i = 0; i < fetches.length; i += 10) {
    await Promise.all(fetches.slice(i, i + 10));
  }

  return results;
}

// ─── Main scanner ───

export async function scanDependencies(configFiles: Record<string, string>): Promise<Dependency[]> {
  let rawDeps: Array<Omit<Dependency, "latestVersion" | "status" | "vulnerabilities">> = [];

  for (const [path, content] of Object.entries(configFiles)) {
    const lower = path.toLowerCase();
    if (lower.endsWith("package.json")) rawDeps.push(...parsePackageJson(content));
    else if (lower.endsWith("composer.json")) rawDeps.push(...parseComposerJson(content));
    else if (lower.endsWith("requirements.txt")) rawDeps.push(...parseRequirementsTxt(content));
    else if (lower.endsWith("gemfile")) rawDeps.push(...parseGemfile(content));
  }

  if (rawDeps.length === 0) return [];

  // Deduplicate
  const seen = new Set<string>();
  rawDeps = rawDeps.filter(d => {
    const key = `${d.ecosystem}:${d.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Check vulnerabilities
  return checkVulnerabilities(rawDeps);
}
