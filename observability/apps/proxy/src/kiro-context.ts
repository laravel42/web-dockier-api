import type { FastifyRequest, FastifyReply, RouteHandlerMethod } from "fastify";
import type { KiroContextPayload } from "@observability/types";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as fsSync from "node:fs";

/**
 * Find the workspace root by walking up from cwd looking for a .kiro directory.
 */
function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fsSync.existsSync(path.join(dir, ".kiro"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * Configuration for the Kiro context export endpoint.
 */
export interface KiroContextConfig {
  /** Directory to write context files to (relative to cwd). Defaults to ".kiro/context" */
  contextDir: string;
  /** Prefix for snapshot filenames. Defaults to "log-snapshot" */
  filePrefix: string;
  /** Maximum number of entries per export. Defaults to 100 */
  maxEntries: number;
}

const DEFAULT_CONFIG: KiroContextConfig = {
  contextDir: ".kiro/context",
  filePrefix: "log-snapshot",
  maxEntries: 100,
};

/**
 * Creates a Fastify route handler for `POST /api/kiro-context`.
 *
 * Validates the incoming KiroContextPayload, ensures the `.kiro/context/`
 * directory exists, and writes a timestamped JSON snapshot file containing
 * the selected log entries and metadata.
 *
 * Validation:
 * - Returns 400 if entries array is empty
 * - Returns 400 if entries exceed maxEntries limit
 * - Overwrites metadata.count with actual entries.length
 * - Truncates description to 500 characters
 *
 * On file write failure, returns 500 with a descriptive error.
 */
export function createKiroContextHandler(
  config?: Partial<KiroContextConfig>,
): RouteHandlerMethod {
  const cfg: KiroContextConfig = { ...DEFAULT_CONFIG, ...config };

  return async function handleKiroContextExport(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const body = request.body as KiroContextPayload | undefined;

    // Validate entries exist and are non-empty
    if (!body?.entries || body.entries.length === 0) {
      reply.status(400).send({ error: "No entries provided" });
      return;
    }

    // Validate entries do not exceed max limit
    if (body.entries.length > cfg.maxEntries) {
      reply.status(400).send({
        error: `Too many entries. Maximum is ${cfg.maxEntries}, got ${body.entries.length}`,
      });
      return;
    }

    // Build the payload — enforce count = entries.length, truncate description
    const payload: KiroContextPayload = {
      entries: body.entries,
      metadata: {
        exportedAt: body.metadata?.exportedAt ?? Date.now(),
        count: body.entries.length,
        source: "observability",
        filters: body.metadata?.filters,
        description: body.metadata?.description?.slice(0, 500),
      },
    };

    const workspaceRoot = findWorkspaceRoot();
    const contextDir = path.resolve(workspaceRoot, cfg.contextDir);

    try {
      // Ensure the context directory exists
      await fs.mkdir(contextDir, { recursive: true });

      // Write the snapshot file
      const filename = `${cfg.filePrefix}-${Date.now()}.json`;
      const filePath = path.join(contextDir, filename);
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");

      reply.send({
        success: true,
        filePath: path.relative(workspaceRoot, filePath),
      });
    } catch (err) {
      request.log.error(
        { err },
        `Failed to write Kiro context file to ${contextDir}`,
      );
      reply.status(500).send({
        error: `Failed to write context file: ${(err as Error).message}`,
      });
    }
  };
}
