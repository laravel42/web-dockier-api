import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createKiroContextHandler } from "./kiro-context.js";
import type { KiroContextPayload, LogEntry } from "@observability/types";
import { createLogEntry } from "@observability/types";

/**
 * Unit tests for POST /api/kiro-context endpoint.
 * Validates Requirements 13.3, 13.4, 13.6, 13.7, 13.8, 13.9, 13.10, 13.11
 */

function makeEntry(overrides?: Partial<LogEntry>): LogEntry {
  return createLogEntry({
    type: "info",
    source: "proxy",
    message: "test log entry",
    ...overrides,
  });
}

function makePayload(
  count: number,
  metadata?: Partial<KiroContextPayload["metadata"]>,
): KiroContextPayload {
  const entries = Array.from({ length: count }, () => makeEntry());
  return {
    entries,
    metadata: {
      exportedAt: Date.now(),
      count: entries.length,
      source: "observability",
      ...metadata,
    },
  };
}

describe("POST /api/kiro-context", () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kiro-ctx-test-"));
    server = Fastify();
    server.post(
      "/api/kiro-context",
      createKiroContextHandler({
        contextDir: path.join(tmpDir, ".kiro", "context"),
        filePrefix: "log-snapshot",
        maxEntries: 100,
      }),
    );
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("validation — empty entries (Requirement 13.6)", () => {
    it("returns 400 when entries array is empty", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/kiro-context",
        payload: { entries: [], metadata: { exportedAt: Date.now(), count: 0, source: "observability" } },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "No entries provided" });
    });

    it("returns 400 when entries is missing", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/kiro-context",
        payload: { metadata: { exportedAt: Date.now(), count: 0, source: "observability" } },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "No entries provided" });
    });

    it("returns 400 when body is empty", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/kiro-context",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "No entries provided" });
    });
  });

  describe("validation — max entries exceeded (Requirement 13.7)", () => {
    it("returns 400 when entries exceed max limit", async () => {
      const payload = makePayload(101);

      const response = await server.inject({
        method: "POST",
        url: "/api/kiro-context",
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: "Too many entries. Maximum is 100, got 101",
      });
    });

    it("accepts exactly max entries", async () => {
      const payload = makePayload(100);

      const response = await server.inject({
        method: "POST",
        url: "/api/kiro-context",
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
    });
  });

  describe("metadata.count enforcement (Requirement 13.11)", () => {
    it("overwrites metadata.count with actual entries.length", async () => {
      const entries = [makeEntry(), makeEntry()];
      const payload: KiroContextPayload = {
        entries,
        metadata: {
          exportedAt: Date.now(),
          count: 999, // intentionally wrong
          source: "observability",
        },
      };

      const response = await server.inject({
        method: "POST",
        url: "/api/kiro-context",
        payload,
      });

      expect(response.statusCode).toBe(200);

      // Read the written file and verify count
      const filePath = response.json().filePath;
      const absPath = path.resolve(process.cwd(), filePath);
      const written = JSON.parse(await fs.readFile(absPath, "utf-8"));
      expect(written.metadata.count).toBe(2);
    });
  });

  describe("description truncation (Requirement 13.10)", () => {
    it("truncates description to 500 characters", async () => {
      const longDesc = "a".repeat(600);
      const payload = makePayload(1, { description: longDesc });

      const response = await server.inject({
        method: "POST",
        url: "/api/kiro-context",
        payload,
      });

      expect(response.statusCode).toBe(200);

      const filePath = response.json().filePath;
      const absPath = path.resolve(process.cwd(), filePath);
      const written = JSON.parse(await fs.readFile(absPath, "utf-8"));
      expect(written.metadata.description.length).toBe(500);
    });

    it("preserves description under 500 characters", async () => {
      const shortDesc = "Short description";
      const payload = makePayload(1, { description: shortDesc });

      const response = await server.inject({
        method: "POST",
        url: "/api/kiro-context",
        payload,
      });

      expect(response.statusCode).toBe(200);

      const filePath = response.json().filePath;
      const absPath = path.resolve(process.cwd(), filePath);
      const written = JSON.parse(await fs.readFile(absPath, "utf-8"));
      expect(written.metadata.description).toBe(shortDesc);
    });

    it("handles missing description gracefully", async () => {
      const payload = makePayload(1);

      const response = await server.inject({
        method: "POST",
        url: "/api/kiro-context",
        payload,
      });

      expect(response.statusCode).toBe(200);

      const filePath = response.json().filePath;
      const absPath = path.resolve(process.cwd(), filePath);
      const written = JSON.parse(await fs.readFile(absPath, "utf-8"));
      expect(written.metadata.description).toBeUndefined();
    });
  });

  describe("directory creation (Requirement 13.4)", () => {
    it("creates .kiro/context/ directory if it does not exist", async () => {
      const contextDir = path.join(tmpDir, ".kiro", "context");

      // Verify directory doesn't exist yet
      await expect(fs.access(contextDir)).rejects.toThrow();

      const payload = makePayload(1);
      const response = await server.inject({
        method: "POST",
        url: "/api/kiro-context",
        payload,
      });

      expect(response.statusCode).toBe(200);

      // Verify directory was created
      const stat = await fs.stat(contextDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe("file writing (Requirement 13.3, 13.9)", () => {
    it("writes a JSON file with entries and metadata", async () => {
      const payload = makePayload(2);

      const response = await server.inject({
        method: "POST",
        url: "/api/kiro-context",
        payload,
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.success).toBe(true);
      expect(result.filePath).toMatch(/log-snapshot-\d+\.json$/);

      // Read and verify file contents
      const absPath = path.resolve(process.cwd(), result.filePath);
      const written = JSON.parse(await fs.readFile(absPath, "utf-8")) as KiroContextPayload;
      expect(written.entries).toHaveLength(2);
      expect(written.metadata.source).toBe("observability");
      expect(written.metadata.count).toBe(2);
    });

    it("produces unique filenames for multiple exports (Requirement 13.9)", async () => {
      const payload1 = makePayload(1);
      const payload2 = makePayload(1);

      const response1 = await server.inject({
        method: "POST",
        url: "/api/kiro-context",
        payload: payload1,
      });

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 5));

      const response2 = await server.inject({
        method: "POST",
        url: "/api/kiro-context",
        payload: payload2,
      });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);
      expect(response1.json().filePath).not.toBe(response2.json().filePath);
    });
  });

  describe("file write failure (Requirement 13.8)", () => {
    it("returns 500 with descriptive error if file write fails", async () => {
      // Create a server with an invalid directory path (read-only)
      const badServer = Fastify();
      badServer.post(
        "/api/kiro-context",
        createKiroContextHandler({
          contextDir: "/dev/null/impossible/path",
          filePrefix: "log-snapshot",
          maxEntries: 100,
        }),
      );
      await badServer.ready();

      const payload = makePayload(1);
      const response = await badServer.inject({
        method: "POST",
        url: "/api/kiro-context",
        payload,
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error).toMatch(/Failed to write context file/);

      await badServer.close();
    });
  });

  describe("custom configuration", () => {
    it("respects custom maxEntries", async () => {
      const customServer = Fastify();
      customServer.post(
        "/api/kiro-context",
        createKiroContextHandler({
          contextDir: path.join(tmpDir, ".kiro", "context"),
          maxEntries: 5,
        }),
      );
      await customServer.ready();

      const payload = makePayload(6);
      const response = await customServer.inject({
        method: "POST",
        url: "/api/kiro-context",
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("Maximum is 5, got 6");

      await customServer.close();
    });
  });
});
