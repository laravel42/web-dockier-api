/**
 * Findings Service Client
 *
 * Cross-service accessor for security scan findings.
 * Used by git-integration to look up findings when creating
 * fix merge requests from scan results.
 */

export { getFindingById } from "../../services/code-analysis/domain/findings.js";
