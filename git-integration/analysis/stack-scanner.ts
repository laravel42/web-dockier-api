/**
 * Stack analysis using @specfy/stack-analyser.
 * Clones the repo to a temp dir, runs the analyser, and returns the result.
 */
import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface StackAnalysis {
  components: StackComponent[];
}

export interface StackComponent {
  id: string;
  name: string;
  path: string[];
  tech: string | null;
  techs: string[];
  languages: Record<string, number>;
  dependencies: Array<{ ecosystem: string; name: string; version: string }>;
  edges: Array<{ target: string; read: boolean; write: boolean }>;
  childs: StackComponent[];
}

export async function analyzeStack(
  provider: string,
  token: string,
  endpoint: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<StackAnalysis | null> {
  const tmpDir = mkdtempSync(join(tmpdir(), "stack-scan-"));

  try {
    // Build clone URL
    let cloneUrl: string;
    if (provider === "github") {
      cloneUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
    } else if (provider === "gitlab" || provider === "gitlab_self_hosted") {
      const host = endpoint ? new URL(endpoint).host : "gitlab.com";
      cloneUrl = `https://oauth2:${token}@${host}/${owner}/${repo}.git`;
    } else if (provider === "bitbucket") {
      cloneUrl = `https://x-token-auth:${token}@bitbucket.org/${owner}/${repo}.git`;
    } else {
      return null;
    }

    // Shallow clone
    console.log(`[stack-scanner] Cloning ${owner}/${repo}@${branch}...`);
    execSync(
      `git clone --depth 1 --branch ${JSON.stringify(branch)} ${JSON.stringify(cloneUrl)} repo`,
      { cwd: tmpDir, timeout: 60_000, stdio: "pipe" },
    );

    const repoDir = join(tmpDir, "repo");

    // Run stack-analyser
    console.log(`[stack-scanner] Analyzing...`);
    // Autoload must be imported before analyser to register rules
    await import("@specfy/stack-analyser/dist/autoload.js");
    const { analyser, FSProvider, flatten } = await import("@specfy/stack-analyser");

    const result = await analyser({
      provider: new FSProvider({ path: repoDir }),
    });

    const flat = flatten(result);
    const json = flat.toJson("/");

    // Map to our format
    const components: StackComponent[] = mapComponents(json);

    console.log(`[stack-scanner] Found ${components.length} components`);
    return { components };
  } catch (e: any) {
    console.error(`[stack-scanner] Failed: ${e.message}`);
    return null;
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

function mapComponents(json: any): StackComponent[] {
  const items: StackComponent[] = [];

  function walk(node: any) {
    items.push({
      id: node.id || "",
      name: node.name || "",
      path: node.path || [],
      tech: node.tech || null,
      techs: node.techs || [],
      languages: node.languages || {},
      dependencies: (node.dependencies || []).map((d: any) =>
        Array.isArray(d) ? { ecosystem: d[0] || "", name: d[1] || "", version: d[2] || "" } : { ecosystem: d.ecosystem || "", name: d.name || "", version: d.version || "" }
      ),
      edges: (node.edges || []).map((e: any) => ({
        target: e.target || "",
        read: e.read ?? true,
        write: e.write ?? true,
      })),
      childs: [],
    });
    if (node.childs) {
      for (const child of node.childs) walk(child);
    }
  }

  if (json.childs) {
    for (const child of json.childs) walk(child);
  } else {
    walk(json);
  }

  return items;
}
