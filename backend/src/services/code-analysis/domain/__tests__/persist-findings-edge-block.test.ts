/**
 * Cloudflare fronts the Supabase REST API, so a blocked insert comes back as an
 * HTML error page in `error.message`. A real scan of laravel42/berry died that
 * way: 200 of its findings were already written, the third batch was blocked,
 * and the whole Cloudflare document was stored as the scan's failure reason and
 * rendered in the sidebar.
 *
 * Pinned here: a blocked batch is retried (one block does not lose a scan's
 * findings), and if the block persists the reason that reaches the user is one
 * line naming the batch and the Ray ID — never the HTML.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScanFindingInput } from "../scan-analysis.js";

/** Trimmed from the page a real blocked insert returned. */
const CLOUDFLARE_BLOCK = `<!DOCTYPE html>
<html class="no-js" lang="en-US"><head><title>Attention Required! | Cloudflare</title></head>
<body><h1 data-translate="block_headline">Sorry, you have been blocked</h1>
<span class="cf-footer-item sm:block sm:mb-1">Cloudflare Ray ID: <strong class="font-semibold">a565cf31281821b4</strong></span>
</body></html>`;

let insertErrors: Array<{ message: string } | null> = [];
/** Content-driven block: any batch containing a matching row is rejected. */
let blockIf: ((row: { snippet: string }) => boolean) | null = null;
const insertedBatches: unknown[][] = [];

vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: () => ({
      delete: () => ({ eq: async () => ({ error: null }) }),
      insert: async (batch: Array<{ snippet: string }>) => {
        insertedBatches.push(batch);
        if (blockIf && batch.some(blockIf)) return { error: { message: CLOUDFLARE_BLOCK } };
        return { error: insertErrors.shift() ?? null };
      },
    }),
  },
}));

vi.mock("../scan-progress.js", () => ({ broadcastScanStatus: vi.fn() }));
// Keep the retry's backoff from making this test sleep for seconds.
vi.mock("../../../../shared/utils/time.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../shared/utils/time.js")>()),
  sleep: async () => {},
}));

const { persistFindings } = await import("../scan-persistence.js");

function findings(count: number): ScanFindingInput[] {
  return Array.from({ length: count }, (_, i) => ({
    ruleId: `javascript.lang.security.rule-${i}`,
    severity: "warning" as const,
    message: "finding",
    filePath: `src/file-${i}.js`,
    startLine: 1,
    endLine: 1,
    snippet: "const x = 1;",
  }));
}

beforeEach(() => {
  insertedBatches.length = 0;
  insertErrors = [];
  blockIf = null;
});

describe("persistFindings against an edge block", () => {
  it("retries a blocked batch instead of losing the scan", async () => {
    insertErrors = [{ message: CLOUDFLARE_BLOCK }];

    await persistFindings("scan-1", "org-1", findings(100));

    expect(insertedBatches).toHaveLength(2); // blocked once, then written
    expect(insertedBatches[1]).toHaveLength(100);
  });

  it("reports one line naming the batch and the Ray ID, not the HTML", async () => {
    blockIf = () => true; // the edge rejects everything, even a snippet-less row

    // 250 findings = 3 batches; the first is blocked on every attempt.
    const failure = await persistFindings("scan-1", "org-1", findings(250)).catch((e: Error) => e);

    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toBe(
      "Failed to insert findings: blocked by the database edge (Cloudflare) on batch 1/3 of 100 rows, Cloudflare Ray ID a565cf31281821b4",
    );
    expect(message).not.toContain("<");
  });

  it("isolates a content-triggered block to one row and keeps every finding", async () => {
    const all = findings(250);
    all[137] = { ...all[137], snippet: "TRIGGER" };
    blockIf = (row) => row.snippet === "TRIGGER";

    await persistFindings("scan-1", "org-1", all);

    // Every successfully stored row, flattened: the 250 findings all land.
    const stored = insertedBatches.flat() as Array<{ snippet: string; file_path: string }>;
    const accepted = stored.filter((r) => r.snippet !== "TRIGGER");
    // Rows rejected on the way are re-sent in smaller batches, so count distinct files.
    expect(new Set(accepted.map((r) => r.file_path)).size).toBe(250);
    const withheld = accepted.filter((r) => r.snippet.startsWith("[snippet withheld"));
    expect(withheld.map((r) => r.file_path)).toEqual(["src/file-137.js"]);
  });

  it("does not retry a rejected row, and keeps the database's own message", async () => {
    insertErrors = [{ message: 'duplicate key value violates unique constraint "findings_pkey"' }];

    await expect(persistFindings("scan-1", "org-1", findings(10))).rejects.toThrow(
      /duplicate key value/,
    );
    expect(insertedBatches).toHaveLength(1); // no second attempt
  });
});
