/**
 * Unified naming utilities for repo, container, and stack name derivation.
 *
 * This is the SINGLE SOURCE OF TRUTH for converting repository paths into
 * safe identifiers used across deploy pipelines, command execution, network
 * rule application, and image builds.
 *
 * All services MUST use these functions to ensure a container deployed by
 * the pipeline is addressed by the same name in command execution, network
 * config, domain config, and destroy operations.
 */

// ─── Repo Name ─────────────────────────────────────────────────────

/**
 * Extract the repository's short name from a full repo path and normalize it
 * to a filesystem/Docker-safe lowercase identifier.
 *
 * Replaces non-alphanumeric characters with hyphens, collapses consecutive
 * hyphens, and trims leading/trailing hyphens — producing names that are
 * valid for Docker tags, ECR repos, and CloudFormation identifiers.
 *
 * e.g. "acme/my-app.io" → "my-app-io"
 *      "user/SomeRepo"  → "somerepo"
 *      "org/my..app"    → "my-app"
 *      "org/.hidden"    → "hidden"
 */
export function deriveRepoName(repo: string): string {
  return (repo.split("/").pop() || "app")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "app";
}

// ─── App Name (for IaC / Tofu previews) ────────────────────────────

/**
 * Normalize a raw string into a valid cloud resource / app name.
 *
 * Strips special characters, collapses consecutive hyphens, and trims
 * leading/trailing hyphens. Suitable for CloudFormation logical IDs,
 * ECS service names, Cloud Run service names, etc.
 *
 * e.g. "my--app.io" → "my-app-io"
 *      "-leading-"  → "leading"
 */
export function normalizeAppName(input: string): string {
  const normalized = input.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return normalized.replace(/-+/g, "-").replace(/^-|-$/g, "") || "app";
}

/**
 * Derive a normalized app name from a full repo path.
 *
 * Combines `deriveRepoName` extraction with `normalizeAppName` cleanup
 * (hyphen collapsing, trimming).
 *
 * e.g. "acme/my--app.io" → "my-app-io"
 */
export function deriveAppName(repo: string): string {
  const repoName = repo.split("/").pop() || "app";
  return normalizeAppName(repoName);
}

// ─── Container Name ────────────────────────────────────────────────

/**
 * Derive the Docker container name from a repo name and cloud provider.
 *
 * AWS uses the derived repo name as-is (already lowercase + hyphens).
 * GCP requires strict lowercase alphanumeric + hyphens, so we apply
 * an additional pass (redundant when input comes from `deriveRepoName`,
 * but safe for any raw input).
 */
export function containerNameFor(repoName: string, provider: string): string {
  if (provider === "aws") return repoName;
  return repoName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

/**
 * Derive a container name directly from a repo path and provider.
 *
 * Convenience function combining `deriveRepoName` + `containerNameFor`.
 * Returns null if the result would be empty or exceed 63 characters
 * (Docker/Kubernetes name length limit).
 */
export function deriveContainerName(repo: string, provider?: string): string | null {
  const repoName = deriveRepoName(repo);
  const containerName = provider ? containerNameFor(repoName, provider) : repoName;
  if (!containerName || containerName.length > 63) return null;
  return containerName;
}

// ─── Stack Name ────────────────────────────────────────────────────

/**
 * Canonical CloudFormation/Pulumi stack name for an app deployed by this platform.
 *
 * e.g. "my-app" → "image-builder-app-my-app"
 */
export function stackNameFor(appName: string): string {
  return "image-builder-app-" + sanitizeEcrRepoName(appName);
}

// ─── ECR Repo Name ─────────────────────────────────────────────────

/**
 * Sanitize a repository name for use as an AWS ECR repository name.
 *
 * ECR repo names must be lowercase and can only contain letters, digits,
 * hyphens, underscores, forward slashes, and periods. We strip to the
 * safest subset (letters, digits, hyphens) for maximum compatibility
 * across all AWS services that reference the ECR image URI.
 *
 * e.g. "My_App.io" → "my-app-io"
 *      "ACME/Repo" → "acme-repo"
 */
export function sanitizeEcrRepoName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}
