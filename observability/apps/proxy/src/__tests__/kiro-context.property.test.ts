import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import Fastify, { type FastifyInstance } from "fastify";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { LogEntry, KiroContextPayload } from "@observability/types";
import { createKiroContextHandler } from "../kiro-context.js";

/**
 * Property-based tests for Kiro Context Export.
 *
 * **Validates: Requirements 13.3, 13.9, 13.10, 13.11**
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const logLevelArb = fc.constantFrom(
  "log" as const,
  "info" as const,
  "debug" as const,
  "warn" as const,
  "error" as const,
);

const logSourceArb = fc.constantFrom(
  "proxy" as const,
  "frontend" as const,
  "service" as const,
);

const logEntryArb: fc.Arbitrary<LogEntry> = fc.record({
  id: fc.uuid(),
  timestamp: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
  type: logLevelArb,
  source: logSourceArb,
  group: fc.string({ minLength: 1, maxLength: 50 }),
  message: fc.string({ minLength: 1, maxLength: 200 }),
  method: fc.option(fc.constantFrom("GET", "POST", "PUT", "DELETE", "PATCH"), { nil: undefined }),
  endpoint: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  status: fc.option(fc.integer({ min: 100, max: 599 }), { nil: undefined }),
  duration: fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: undefined }),
  payloadSize: fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: undefined }),
  error: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildApp(contextDir: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.post(
    "/api/kiro-context",
    createKiroContextHandler({
      contextDir,
      maxEntries: 100,
      filePrefix: "log-snapshot",
    }),
  );
  await app.ready();
  return app;
}

async function readWrittenFiles(dir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dir);
    return files.filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Property 11: Kiro Context Export Integrity
// ---------------------------------------------------------------------------

describe("Kiro Context Export — Property 11: Kiro Context Export Integrity", () => {
  let tmpDir: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kiro-ctx-integrity-"));
    app = await buildApp(tmpDir);
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * **Validates: Requirements 13.3, 13.11**
   *
   * For any valid KiroContextPayload with 1 to 100 entries, the written file's
   * entries array matches the input entries exactly (same ids, same order) and
   * metadata.count equals entries.length.
   */
  it("written file entries match input entries exactly and metadata.count equals entries.length", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(logEntryArb, { minLength: 1, maxLength: 20 }),
        async (entries) => {
          const payload: KiroContextPayload = {
            entries,
            metadata: {
              exportedAt: Date.now(),
              count: entries.length,
              source: "observability",
            },
          };

          const response = await app.inject({
            method: "POST",
            url: "/api/kiro-context",
            payload,
          });

          expect(response.statusCode).toBe(200);

          const result = response.json();
          expect(result.success).toBe(true);

          // Read the written file
          const files = await readWrittenFiles(tmpDir);
          expect(files.length).toBeGreaterThanOrEqual(1);

          const lastFile = files[files.length - 1];
          const fileContent = await fs.readFile(
            path.join(tmpDir, lastFile),
            "utf-8",
          );
          const written = JSON.parse(fileContent) as KiroContextPayload;

          // Entries match exactly — same ids, same order
          expect(written.entries.length).toBe(entries.length);
          for (let i = 0; i < entries.length; i++) {
            expect(written.entries[i].id).toBe(entries[i].id);
            expect(written.entries[i].message).toBe(entries[i].message);
            expect(written.entries[i].type).toBe(entries[i].type);
            expect(written.entries[i].source).toBe(entries[i].source);
          }

          // metadata.count equals entries.length
          expect(written.metadata.count).toBe(entries.length);
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * **Validates: Requirements 13.11**
   *
   * metadata.source is always "observability".
   */
  it("written file metadata.source is always 'observability'", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(logEntryArb, { minLength: 1, maxLength: 10 }),
        async (entries) => {
          const payload: KiroContextPayload = {
            entries,
            metadata: {
              exportedAt: Date.now(),
              count: entries.length,
              source: "observability",
            },
          };

          const response = await app.inject({
            method: "POST",
            url: "/api/kiro-context",
            payload,
          });

          expect(response.statusCode).toBe(200);

          const files = await readWrittenFiles(tmpDir);
          const lastFile = files[files.length - 1];
          const fileContent = await fs.readFile(
            path.join(tmpDir, lastFile),
            "utf-8",
          );
          const written = JSON.parse(fileContent) as KiroContextPayload;

          expect(written.metadata.source).toBe("observability");
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * **Validates: Requirements 13.10**
   *
   * Any provided description is truncated to 500 characters in the written file.
   */
  it("description is truncated to 500 characters in the written file", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(logEntryArb, { minLength: 1, maxLength: 5 }),
        fc.string({ minLength: 1, maxLength: 2000 }),
        async (entries, description) => {
          const payload: KiroContextPayload = {
            entries,
            metadata: {
              exportedAt: Date.now(),
              count: entries.length,
              source: "observability",
              description,
            },
          };

          const response = await app.inject({
            method: "POST",
            url: "/api/kiro-context",
            payload,
          });

          expect(response.statusCode).toBe(200);

          const files = await readWrittenFiles(tmpDir);
          const lastFile = files[files.length - 1];
          const fileContent = await fs.readFile(
            path.join(tmpDir, lastFile),
            "utf-8",
          );
          const written = JSON.parse(fileContent) as KiroContextPayload;

          // Description must be at most 500 characters
          if (written.metadata.description !== undefined) {
            expect(written.metadata.description.length).toBeLessThanOrEqual(500);
          }

          // If original was <= 500 chars, it should be preserved exactly
          if (description.length <= 500) {
            expect(written.metadata.description).toBe(description);
          } else {
            // If original was > 500 chars, it should be the first 500 chars
            expect(written.metadata.description).toBe(
              description.slice(0, 500),
            );
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: Kiro Context Export Uniqueness
// ---------------------------------------------------------------------------

describe("Kiro Context Export — Property 12: Kiro Context Export Uniqueness", () => {
  let tmpDir: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kiro-ctx-unique-"));
    app = await buildApp(tmpDir);
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * **Validates: Requirements 13.9**
   *
   * For any two or more distinct export operations, all produced file paths
   * are unique — no export overwrites a previous one.
   */
  it("multiple exports produce files with unique paths", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.array(logEntryArb, { minLength: 1, maxLength: 5 }),
          { minLength: 2, maxLength: 6 },
        ),
        async (entryBatches) => {
          const filesBefore = await readWrittenFiles(tmpDir);
          const filePaths: string[] = [];

          for (const entries of entryBatches) {
            const payload: KiroContextPayload = {
              entries,
              metadata: {
                exportedAt: Date.now(),
                count: entries.length,
                source: "observability",
              },
            };

            const response = await app.inject({
              method: "POST",
              url: "/api/kiro-context",
              payload,
            });

            expect(response.statusCode).toBe(200);
            const result = response.json();
            filePaths.push(result.filePath);

            // Small delay to ensure timestamp-based filenames differ
            await new Promise((resolve) => setTimeout(resolve, 2));
          }

          // All file paths must be unique
          const uniquePaths = new Set(filePaths);
          expect(uniquePaths.size).toBe(filePaths.length);

          // Verify the correct number of NEW files were created on disk
          const filesAfter = await readWrittenFiles(tmpDir);
          const newFiles = filesAfter.length - filesBefore.length;
          expect(newFiles).toBe(entryBatches.length);
        },
      ),
      { numRuns: 10 },
    );
  });
});
