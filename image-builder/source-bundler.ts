// ─── Source Bundling ───
// Downloads repo from GitHub, injects buildspec.yml, creates zip, uploads to S3

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getBuildspecContent } from "./shared";
import { buildCloneUrl } from "../lib/git-url";

export async function bundleAndUploadSource(
  sourceRepo: string,
  sourceRef: string,
  buildId: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  bucketName: string,
  gitToken?: string,
  gitProvider?: string,
  gitEndpoint?: string,
  deployTarget?: string,
): Promise<{ s3Key: string; detectedRuntime: string; detectedPort: number }> {
  const { execSync } = await import("node:child_process");
  const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { readdirSync } = await import("node:fs");

  // Build clone URL with auth
  const cloneUrl = buildCloneUrl({
    provider: gitProvider || "",
    token: gitToken || "",
    repo: sourceRepo,
    endpoint: gitEndpoint,
  });

  const tmpDir = mkdtempSync(join(tmpdir(), `ib-${buildId}-`));
  try {
    console.log(`Cloning ${sourceRepo}@${sourceRef} (provider: ${gitProvider || "public"})`);
    execSync(
      `git clone --depth 1 --branch ${JSON.stringify(sourceRef)} ${JSON.stringify(cloneUrl)} repo`,
      { cwd: tmpDir, timeout: 120_000, stdio: "pipe" },
    );

    const repoDir = join(tmpDir, "repo");

    // Detect tech stack and inject tailored buildspec + Dockerfile
    const { analyzeRepoConfig, generateDockerfile: genDF, toDetectedStack } = await import("../lib/repo-analyzer");
    const { generateBuildspec, generateStaticBuildspec } = await import("../lib/buildspec-generator");
    const { existsSync } = await import("node:fs");
    const repoConfig = analyzeRepoConfig(repoDir);
    const stack = toDetectedStack(repoConfig);
    console.log(`Detected stack: ${stack.runtime}${stack.subDir ? ` (subDir: ${stack.subDir})` : ""}`);

    // For static deploys (S3 + CloudFront), use static buildspec — no Docker needed
    let detectedPort = 3000;
    if (deployTarget === "s3") {
      const buildspecContent = generateStaticBuildspec();
      writeFileSync(join(repoDir, "buildspec.yml"), buildspecContent);
      console.log("Generated static buildspec for S3 deploy");
    } else {
      // Generate stack-specific buildspec
      const buildspecContent = generateBuildspec(stack);
      writeFileSync(join(repoDir, "buildspec.yml"), buildspecContent);

    // Generate Dockerfile if the repo doesn't already have one
    let generatedDockerfile = false;
    if (!existsSync(join(repoDir, "Dockerfile"))) {
      const dockerfile = genDF(repoConfig, repoDir);
      if (dockerfile) {
        writeFileSync(join(repoDir, "Dockerfile"), dockerfile);
        generatedDockerfile = true;
        // Extract port from generated Dockerfile
        const exposeMatch = dockerfile.match(/EXPOSE\s+(\d+)/);
        if (exposeMatch) detectedPort = parseInt(exposeMatch[1]);
        console.log(`Generated Dockerfile for ${stack.runtime} (port: ${detectedPort})`);

        // Inject Django deploy patch script if needed
        if (stack.runtime === "python" && "framework" in stack && stack.framework === "django") {
          const patchScript = `import pathlib, re
for sf in sorted(pathlib.Path(".").rglob("settings.py")):
    s = str(sf)
    if "venv" in s or "site-packages" in s:
        continue
    txt = sf.read_text()
    if "ALLOWED_HOSTS" not in txt:
        continue
    txt = re.sub(r"ALLOWED_HOSTS\\s*=\\s*\\[.*?\\]", 'ALLOWED_HOSTS = ["*"]', txt, flags=re.DOTALL)
    txt += '\\nimport os\\nSECRET_KEY = os.environ.get("SECRET_KEY", "django-insecure-deploy-key")\\nDEBUG = False\\n'
    sf.write_text(txt)
    print(f"Patched {sf}")
    break
`;
          writeFileSync(join(repoDir, "_deploy_patch.py"), patchScript);
          console.log("Injected Django deploy patch script");
        }
      } else {
        const fallbackBuildspec = getBuildspecContent();
        writeFileSync(join(repoDir, "buildspec.yml"), fallbackBuildspec);
        console.log("Unknown stack, falling back to generic buildspec with auto-detection");
      }
    } else {
      // Detect port from existing Dockerfile
      try {
        const df = readFileSync(join(repoDir, "Dockerfile"), "utf-8");
        const exposeMatch = df.match(/EXPOSE\s+(\d+)/);
        if (exposeMatch) detectedPort = parseInt(exposeMatch[1]);
      } catch {}
      console.log(`Repo already has a Dockerfile, using it as-is (port: ${detectedPort})`);
    }
    } // end of non-static (Docker) path

    // Generate .dockerignore if not present
    if (!existsSync(join(repoDir, ".dockerignore"))) {
      const dockerignore = [
        "node_modules", ".next", ".git", ".gitignore",
        "dist", "build", "out", "output", ".turbo", ".cache", ".pnpm-store",
        "/vendor", ".env", "*.log",
        "!.env.example",
        "coverage", ".nyc_output", "__pycache__", "*.pyc", ".venv", "venv",
        "*.md", "*.mdx", "LICENSE", ".vscode", ".idea", ".cursor",
      ].join("\n");
      writeFileSync(join(repoDir, ".dockerignore"), dockerignore);
    }

    // Remove .git directory (not needed in build)
    rmSync(join(repoDir, ".git"), { recursive: true, force: true });

    // Create zip
    const { default: AdmZip } = await import("adm-zip");
    const zip = new AdmZip();
    const skipDirs = new Set(["node_modules", ".git", ".pnpm-store", ".turbo", ".cache", "__pycache__", ".venv", "venv"]);
    // Only skip root-level vendor (Composer deps), not nested vendor dirs like resources/views/vendor
    const skipRootOnly = new Set(["vendor"]);
    const addDir = (dirPath: string, zipPrefix: string) => {
      const items = readdirSync(dirPath, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory() && skipDirs.has(item.name)) continue;
        if (item.isDirectory() && skipRootOnly.has(item.name) && !zipPrefix) continue;
        const fullPath = join(dirPath, item.name);
        if (item.isDirectory()) {
          addDir(fullPath, zipPrefix ? `${zipPrefix}/${item.name}` : item.name);
        } else {
          zip.addLocalFile(fullPath, zipPrefix || undefined);
        }
      }
    };
    addDir(repoDir, "");
    const zipBuffer = zip.toBuffer();
    console.log(`Created zip: ${zipBuffer.length} bytes`);

    // Upload to S3
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
    const s3Key = `${buildId}.zip`;

    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: zipBuffer,
      ContentType: "application/zip",
    }));

    return { s3Key, detectedRuntime: stack.runtime, detectedPort };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
