/**
 * Source Bundling for CodeBuild.
 *
 * Downloads repo, injects buildspec.yml, creates zip, uploads to S3.
 * Uses the shared build pipeline for clone + analyze + Dockerfile generation,
 * then layers on the zip/S3 upload logic specific to CodeBuild.
 */

import { join } from "node:path";
import { cloneRepo, analyzeAndGenerate } from "../../../lib/build-pipeline.js";
import { ensureS3Bucket } from "../../../lib/aws.js";
import { createConsoleLogger } from "../../../lib/logging.js";

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
  options?: { skipExistingDockerfile?: boolean },
): Promise<{ s3Key: string; detectedRuntime: string; detectedPort: number }> {
  const { rmSync, writeFileSync, readdirSync, existsSync } = await import("node:fs");
  const { generateBuildspec, generateStaticBuildspec } = await import("../../../lib/buildspec-generator/index.js");

  const logger = createConsoleLogger(`ib-${buildId}`);

  // ─── Clone ───────────────────────────────────────────────────────
  const { repoDir, workDir } = await cloneRepo({
    git: {
      provider: gitProvider || "",
      token: gitToken || "",
      repo: sourceRepo,
      endpoint: gitEndpoint,
    },
    branch: sourceRef,
    shortId: buildId,
    logger,
  });

  try {
    // ─── Analyze & Generate Dockerfile ─────────────────────────────
    const { detectedStack, detectedPort } = await analyzeAndGenerate({
      repoDir,
      logger,
      skipExistingDockerfile: options?.skipExistingDockerfile === true,
    });

    // ─── Inject Buildspec ──────────────────────────────────────────
    if (deployTarget === "s3") {
      const buildspecContent = generateStaticBuildspec();
      writeFileSync(join(repoDir, "buildspec.yml"), buildspecContent);
      await logger.info("Generated static buildspec for S3 deploy");
    } else if (!existsSync(join(repoDir, "Dockerfile"))) {
      // No Dockerfile — use a generic buildspec
      const fallbackBuildspec = generateBuildspec(detectedStack);
      writeFileSync(join(repoDir, "buildspec.yml"), fallbackBuildspec);
      await logger.info("Unknown stack, falling back to generic buildspec");
    } else {
      const buildspecContent = generateBuildspec(detectedStack);
      writeFileSync(join(repoDir, "buildspec.yml"), buildspecContent);

      // Inject Django deploy patch script if needed
      if (detectedStack.runtime === "python" && "framework" in detectedStack && detectedStack.framework === "django") {
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
        await logger.info("Injected Django deploy patch script");
      }
    }

    // ─── Remove .git (not needed in build) ─────────────────────────
    rmSync(join(repoDir, ".git"), { recursive: true, force: true });

    // ─── Create Zip ────────────────────────────────────────────────
    const { default: AdmZip } = await import("adm-zip");
    const zip = new AdmZip();
    const skipDirs = new Set(["node_modules", ".git", ".pnpm-store", ".turbo", ".cache", "__pycache__", ".venv", "venv"]);
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
    await logger.info(`Created zip: ${zipBuffer.length} bytes`);

    // ─── Upload to S3 ──────────────────────────────────────────────
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
    const s3Key = `${buildId}.zip`;

    await ensureS3Bucket(region, { accessKeyId, secretAccessKey }, bucketName);
    await logger.info(`Ensured S3 source bucket: ${bucketName}`);

    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: zipBuffer,
      ContentType: "application/zip",
    }));

    return { s3Key, detectedRuntime: detectedStack.runtime, detectedPort };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
