/**
 * Service Clients
 *
 * Thin cross-service accessors for data owned by other services.
 * Each module exposes a minimal interface that other services can
 * import without depending on the owning service's domain layer.
 *
 * Benefits:
 * - Single point of change when the underlying schema evolves
 * - Cross-service dependencies are explicit and discoverable
 * - Consumers get a narrow, typed contract instead of raw DB access
 * - Easy to mock in tests
 */

export { getGitConnectionCredentials, type GitConnectionCredentials } from "./git-connections.js";
export { getProjectDeployConfig, type ProjectDeployConfig } from "./projects.js";
export { getActiveDeployment, type ActiveDeployment } from "./deployments.js";
