import { Subscription } from "encore.dev/pubsub";
import { db, deployTopic, type DeployEvent, DEFAULT_REGIONS, extractRegionFromScript } from "../shared";
import { appendLog, ts } from "./helpers";
import { getTemplateConfig } from "../templates";
import { handleTemplateDeploy } from "./template-deploy";
import { createStreamingRunCmd } from "./run-cmd";
import { cloneRepository, analyzeAndGenerateDockerfile, buildDockerImage, dispatchToAdapter } from "./pipeline";
import { buildViaCodeBuild } from "./codebuild-builder";

const _ = new Subscription(deployTopic, "deploy-processor", {
  ackDeadline: "30m",
  handler: async (event: DeployEvent) => {
    const { deploymentId } = event;

    // Idempotency guard: skip if this deployment is already being processed
    const current = await db.queryRow<{ status: string }>`
      SELECT status FROM deployments WHERE id = ${deploymentId}`;
    if (current?.status === "building" || current?.status === "deploying") {
      return;
    }

    const repoName = event.repo.split("/").pop() || "app";
    const shortId = deploymentId.slice(0, 8);

    const providerRow = await db.queryRow<{ provider: string; region: string; api_key: string; api_secret: string }>`
      SELECT provider, region, api_key, api_secret FROM server_providers WHERE id = ${event.providerId}`;
    const provider = providerRow?.provider || "cloud";
    let region = providerRow?.region || DEFAULT_REGIONS[providerRow?.provider || ""] || "us-east-1";

    if (event.tofuScript) {
      const scriptRegion = extractRegionFromScript(event.tofuScript);
      if (scriptRegion) region = scriptRegion;
    }

    // ── Template deploy path ──
    if (event.templateId) {
      const templateConfig = getTemplateConfig(event.templateId);
      if (templateConfig) {
        const projectRow = await db.queryRow<{ name: string }>`SELECT name FROM projects WHERE app_id = ${event.appId} ORDER BY created_at DESC LIMIT 1`;
        const templateRepoName = projectRow?.name || repoName;
        try {
          await handleTemplateDeploy(event, templateConfig, {
            deploymentId, repoName: templateRepoName, shortId, provider, region,
            providerRow: providerRow!,
          });
        } catch (e: any) {
          await appendLog(deploymentId, `[${ts()}]`);
          await appendLog(deploymentId, `[${ts()}] ✗ Template deployment failed: ${e.message || e}`);
          await db.exec`UPDATE deployments SET status = 'failed', updated_at = NOW() WHERE id = ${deploymentId}`;
        }
        return;
      }
    }

    // ── Standard deploy path ──
    const runCmd = createStreamingRunCmd(deploymentId, appendLog, ts);

    try {
      await db.exec`UPDATE deployments SET status = 'building', updated_at = NOW() WHERE id = ${deploymentId}`;
      await appendLog(deploymentId, `[${ts()}] ▶ Starting deployment pipeline...`);

      let displayRegion = region;
      if (provider === "gcp" && event.tofuScript) {
        const scriptRegion = extractRegionFromScript(event.tofuScript);
        if (scriptRegion) displayRegion = scriptRegion;
      }
      await appendLog(deploymentId, `[${ts()}] ℹ Provider: ${provider} | Region: ${displayRegion}`);
      await appendLog(deploymentId, `[${ts()}] ℹ Strategy: ${event.deployStrategy || "managed (default)"}`);
      await appendLog(deploymentId, `[${ts()}] ℹ Repository: ${event.repo} | Branch: ${event.branch}`);

      // 1. Clone repository
      const { repoDir, workDir, commitHash } = await cloneRepository({ deploymentId, shortId, event });

      // 2. Analyze and generate Dockerfile
      const { repoConfig } = await analyzeAndGenerateDockerfile({ deploymentId, repoDir });

      // 3. Build image (local Docker or remote CodeBuild)
      let actualImage: string;
      if (event.buildMethod === "codebuild") {
        const result = await buildViaCodeBuild({
          deploymentId, repoName, shortId, region,
          providerRow: providerRow!, repoDir, workDir, commitHash,
          repoConfig, event,
        });
        actualImage = result.remoteImageUri;
        // Save image reference (buildDockerImage does this for local builds)
        await db.exec`UPDATE deployments SET docker_image = ${actualImage} WHERE id = ${deploymentId}`;
      } else {
        const imageName = `${repoName}:${shortId}`;
        const result = await buildDockerImage({
          deploymentId, repoDir, imageName, commitHash, event, runCmd,
        });
        actualImage = result.actualImage;
      }

      // 4. Dispatch to adapter (push + provision + post-deploy)
      await dispatchToAdapter({
        deploymentId, repoName, shortId, region, repoDir, workDir, commitHash,
        provider, providerRow: providerRow!, event, repoConfig, actualImage, runCmd,
      });
    } catch (e: any) {
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ✗ Deployment failed: ${e.message || e}`);
      await db.exec`UPDATE deployments SET status = 'failed', updated_at = NOW() WHERE id = ${deploymentId}`;
    }
  },
});
