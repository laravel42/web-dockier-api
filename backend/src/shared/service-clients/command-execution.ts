/**
 * Command Execution Service Client
 *
 * Cross-service facade for executing commands on deployed infrastructure.
 * Used by processes, network, domains, and observe services that need to
 * run commands on a project's deployment target.
 *
 * This re-exports from the commands service's domain layer — the owning
 * service retains the implementation. If the commands service is later
 * split into a separate microservice, only this file needs updating.
 *
 * All cross-service consumers MUST import from here, not directly from
 * `commands/domain/executor.js` or `commands/domain/worker.js`.
 */

export { executeCommand, type ExecutionTarget, type ExecutionResult } from "../../services/commands/domain/executor.js";
export { resolveExecutionTarget } from "../../services/commands/domain/worker.js";
