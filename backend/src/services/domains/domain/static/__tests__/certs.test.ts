/**
 * Coverage for the certificate WRITE path.
 *
 * This file exists because the production failure it reproduces shipped green:
 * `aws.test.ts` mocks `../certs.js` wholesale, so the real query builder — and
 * every error it can return — had zero coverage. That mock is doing its job for
 * the reconcile-logic tests and is left alone; coverage is added here, one
 * layer down, where the real `certs.ts` runs.
 *
 * Only `shared/supabase/client.js` is faked, with a builder that mimics
 * PostgREST's chain and returns real-shaped errors (`code`/`message`/`details`/`hint`).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface QueryResult {
  data: unknown;
  error: { code?: string; message: string; details?: string; hint?: string } | null;
}

/** Queued results, one per `from()` call, in order. */
let queued: QueryResult[] = [];
let fromCalls: string[] = [];
/** Rows passed to `.update()`, so the phase-clock invariant is observable. */
let updates: Array<Record<string, unknown>> = [];

/**
 * A thenable that answers every builder method with itself, so the same fake
 * serves `.select().eq().in()` (awaited directly) and `.insert().select().single()`.
 */
function builder(result: QueryResult): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of ["select", "eq", "in", "insert", "delete", "single", "maybeSingle"]) {
    chain[method] = () => chain;
  }
  chain.update = (row: Record<string, unknown>) => {
    updates.push(row);
    return chain;
  };
  return chain;
}

vi.mock("../../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      fromCalls.push(table);
      const next = queued.shift();
      if (!next) throw new Error(`no queued result for from("${table}")`);
      return builder(next);
    },
  },
}));

vi.mock("../../../../../shared/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const {
  ensureStaticCertRow,
  findStaticCertRow,
  listStaticCertRows,
  deleteStaticCertRows,
  setCertState,
} = await import("../certs.js");

/** A row as PostgREST would return it, snake_case. */
const dbRow = {
  id: "cert-1",
  domain_name: "www.example.com",
  type: "acm",
  status: "pending",
  provider_ref: null,
  validation_record: null,
  verification_state: "pending",
  verification_message: null,
  attach_started_at: null,
};

const ensureParams = {
  tenantId: "tenant-1",
  projectId: "project-1",
  domainName: "www.example.com",
  domainId: "domain-1",
  type: "acm" as const,
};

beforeEach(() => {
  queued = [];
  fromCalls = [];
  updates = [];
});

describe("setCertState — the phase-clock invariant", () => {
  /**
   * `attach_started_at` is written if and only if the state being written
   * DIFFERS from the one already persisted.
   *
   * Getting this wrong does not fail loudly — it makes every phase-scoped
   * deadline silently unreachable, because a clock re-stamped on every look
   * never ages past one poll interval. That is why it has its own tests.
   */
  it("stamps the clock on a genuine phase entry", async () => {
    queued = [{ data: null, error: null }];

    await setCertState("cert-1", { verificationState: "provisioning" }, "awaiting_dns");

    expect(updates).toHaveLength(1);
    expect(updates[0].attach_started_at).toBeTypeOf("string");
  });

  it("leaves the clock alone when the write re-asserts the same state", async () => {
    // This is the sweep's common case: look, nothing changed, write the same
    // state. Re-stamping here is what disables the deadlines.
    queued = [{ data: null, error: null }];

    await setCertState("cert-1", { verificationState: "attaching" }, "attaching");

    expect(updates[0].attach_started_at).toBeUndefined();
  });

  it("leaves the clock alone when no state is being written at all", async () => {
    // A message-only write, as a transient failure makes.
    queued = [{ data: null, error: null }];

    await setCertState("cert-1", { verificationMessage: "retrying shortly" }, "pending");

    expect(updates[0].attach_started_at).toBeUndefined();
    expect(updates[0].verification_state).toBeUndefined();
  });

  it("honours an explicit clock, which is how Resume works", async () => {
    // Resume deliberately sets a fresh phase clock while moving to `pending`.
    queued = [{ data: null, error: null }];

    await setCertState(
      "cert-1",
      { verificationState: "pending", attachStartedAt: "2026-10-06T00:00:00.000Z" },
      "timed_out",
    );

    expect(updates[0].attach_started_at).toBe("2026-10-06T00:00:00.000Z");
  });

  it("does not stamp when the caller does not say what the row holds", async () => {
    // Back-compatible: a caller that cannot supply the current state gets the
    // old behaviour of never touching the clock, rather than a wrong stamp.
    queued = [{ data: null, error: null }];

    await setCertState("cert-1", { verificationState: "live" });

    expect(updates[0].attach_started_at).toBeUndefined();
  });

  it("always advances updated_at, which is the poll clock", async () => {
    queued = [{ data: null, error: null }];

    await setCertState("cert-1", { verificationMessage: "anything" }, "pending");

    expect(updates[0].updated_at).toBeTypeOf("string");
  });
});

describe("ensureStaticCertRow — schema drift is permanent", () => {
  it("reports PGRST204 as non-retryable schema drift", () => {
    // The exact production failure: `verification_state` is absent from the
    // schema cache because migration 0075 was never applied.
    queued = [
      { data: null, error: null }, // the find: nothing there
      {
        data: null,
        error: {
          code: "PGRST204",
          message: "Could not find the 'verification_state' column of 'ssl_certificates'",
          details: "",
          hint: "",
        },
      },
    ];

    return ensureStaticCertRow(ensureParams).then((result) => {
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected a failure");
      expect(result.failure.kind).toBe("schema_drift");
      expect(result.failure.retryable).toBe(false);
      expect(result.failure.message).not.toMatch(/try .*again/i);
      expect(result.failure.detail.code).toBe("PGRST204");
    });
  });

  it("reports an undefined column (42703) as non-retryable", async () => {
    queued = [
      { data: null, error: null },
      { data: null, error: { code: "42703", message: 'column "provider_ref" does not exist' } },
    ];

    const result = await ensureStaticCertRow(ensureParams);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.failure.kind).toBe("schema_drift");
    expect(result.failure.retryable).toBe(false);
  });

  it("reports a type CHECK violation (23514) as non-retryable", async () => {
    // The second half of the drift: the pre-0075 CHECK rejects type = 'acm'.
    queued = [
      { data: null, error: null },
      {
        data: null,
        error: {
          code: "23514",
          message: 'new row for relation "ssl_certificates" violates check constraint "ssl_certificates_type_check"',
        },
      },
    ];

    const result = await ensureStaticCertRow(ensureParams);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.failure.kind).toBe("schema_drift");
    expect(result.failure.retryable).toBe(false);
  });
});

describe("ensureStaticCertRow — the concurrent-insert path is unchanged", () => {
  it("re-reads on a unique violation rather than reporting a failure", async () => {
    queued = [
      { data: null, error: null }, // find: nothing
      { data: null, error: { code: "23505", message: "duplicate key value" } }, // insert: raced
      { data: dbRow, error: null }, // re-read: the winner's row
    ];

    const result = await ensureStaticCertRow(ensureParams);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.row.id).toBe("cert-1");
    // find → insert → re-read
    expect(fromCalls).toHaveLength(3);
  });

  it("reports a failure when the re-read after a unique violation also fails", async () => {
    queued = [
      { data: null, error: null },
      { data: null, error: { code: "23505", message: "duplicate key value" } },
      { data: null, error: { code: "PGRST204", message: "Could not find the column" } },
    ];

    const result = await ensureStaticCertRow(ensureParams);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.failure.kind).toBe("schema_drift");
  });

  it("returns the existing row without inserting when one is already there", async () => {
    queued = [{ data: dbRow, error: null }];

    const result = await ensureStaticCertRow(ensureParams);

    expect(result.ok).toBe(true);
    expect(fromCalls).toHaveLength(1);
  });

  it("propagates a failed pre-read instead of attempting an insert", async () => {
    queued = [{ data: null, error: { code: "42703", message: 'column "status" does not exist' } }];

    const result = await ensureStaticCertRow(ensureParams);

    expect(result.ok).toBe(false);
    // No insert attempted — the read told us the schema is wrong.
    expect(fromCalls).toHaveLength(1);
  });
});

describe("findStaticCertRow", () => {
  it("distinguishes 'nothing there' from 'could not read'", async () => {
    queued = [{ data: null, error: null }];
    const empty = await findStaticCertRow("project-1", "www.example.com");
    expect(empty.ok).toBe(true);
    if (!empty.ok) throw new Error("expected success");
    expect(empty.row).toBeNull();

    queued = [{ data: null, error: { code: "PGRST204", message: "Could not find the column" } }];
    const failed = await findStaticCertRow("project-1", "www.example.com");
    expect(failed.ok).toBe(false);
  });
});

describe("listStaticCertRows", () => {
  it("returns ok: false on a failed read rather than an empty list", async () => {
    // Collapsing this into `[]` is what would make the reconcile treat every
    // existing certificate row as orphaned and delete it.
    queued = [{ data: null, error: { code: "42703", message: 'column "provider_ref" does not exist' } }];

    const result = await listStaticCertRows("project-1");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.failure.kind).toBe("schema_drift");
  });

  it("maps rows on success", async () => {
    queued = [{ data: [dbRow], error: null }];

    const result = await listStaticCertRows("project-1");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].domainName).toBe("www.example.com");
    expect(result.rows[0].verificationState).toBe("pending");
  });
});

describe("deleteStaticCertRows", () => {
  it("reports ok: false on failure and issues no query for an empty list", async () => {
    queued = [{ data: null, error: { code: "42501", message: "permission denied" } }];
    const failed = await deleteStaticCertRows("project-1", ["www.example.com"]);
    expect(failed.ok).toBe(false);

    fromCalls = [];
    const noop = await deleteStaticCertRows("project-1", []);
    expect(noop.ok).toBe(true);
    expect(fromCalls).toHaveLength(0);
  });
});
