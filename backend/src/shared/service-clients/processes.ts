/**
 * Processes Service Client
 *
 * Cross-service accessor for process lifecycle operations.
 * Used by the deploy pipeline to restore background processes
 * after a successful deployment.
 */

export { restoreProcessesAfterDeploy } from "../../services/processes/domain/post-deploy-restore.js";
