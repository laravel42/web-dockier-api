/**
 * Supabase Query Helpers — Unit Tests
 *
 * Tests the shared query utilities (normalizePagination, throwOnError,
 * unwrapQuery, unwrapList, assertOwnership) that all domain modules rely on.
 */

import { describe, it, expect } from "vitest";
import {
  normalizePagination,
  throwOnError,
  unwrapQuery,
  unwrapList,
  assertFound,
  assertOwnership,
} from "../supabase/query.js";

// Simple error class for testing
class TestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TestError";
  }
}

describe("normalizePagination", () => {
  it("returns defaults when no params provided", () => {
    const result = normalizePagination({});
    expect(result).toEqual({ limit: 20, offset: 0 });
  });

  it("uses provided values within bounds", () => {
    const result = normalizePagination({ limit: 50, offset: 10 });
    expect(result).toEqual({ limit: 50, offset: 10 });
  });

  it("clamps limit to maximum of 100", () => {
    const result = normalizePagination({ limit: 500 });
    expect(result.limit).toBe(100);
  });

  it("clamps limit to minimum of 1", () => {
    const result = normalizePagination({ limit: 0 });
    expect(result.limit).toBe(1);
  });

  it("clamps negative limit to 1", () => {
    const result = normalizePagination({ limit: -5 });
    expect(result.limit).toBe(1);
  });

  it("clamps negative offset to 0", () => {
    const result = normalizePagination({ offset: -10 });
    expect(result.offset).toBe(0);
  });

  it("handles edge case limit of exactly 1", () => {
    const result = normalizePagination({ limit: 1 });
    expect(result.limit).toBe(1);
  });

  it("handles edge case limit of exactly 100", () => {
    const result = normalizePagination({ limit: 100 });
    expect(result.limit).toBe(100);
  });
});

describe("throwOnError", () => {
  it("does nothing when error is null", () => {
    expect(() => throwOnError(null, TestError)).not.toThrow();
  });

  it("throws not_found for PGRST116 code", () => {
    const error = { message: "Row not found", code: "PGRST116" };
    expect(() => throwOnError(error, TestError, { notFoundMsg: "Thing not found" }))
      .toThrow("Thing not found");
  });

  it("throws bad_request for duplicate key (23505) when duplicateMsg provided", () => {
    const error = { message: "duplicate key", code: "23505" };
    expect(() => throwOnError(error, TestError, { duplicateMsg: "Already exists" }))
      .toThrow("Already exists");
  });

  it("throws internal for duplicate key (23505) when no duplicateMsg", () => {
    const error = { message: "duplicate key", code: "23505" };
    expect(() => throwOnError(error, TestError, { internalMsg: "DB failed" }))
      .toThrow("DB failed");
  });

  it("throws internal for unknown errors", () => {
    const error = { message: "connection reset", code: "XX000" };
    expect(() => throwOnError(error, TestError, { internalMsg: "Oops" }))
      .toThrow("Oops");
  });

  it("uses default messages when no options provided", () => {
    const error = { message: "something", code: "PGRST116" };
    expect(() => throwOnError(error, TestError)).toThrow("Resource not found");
  });
});

describe("assertFound", () => {
  it("returns data when it exists", () => {
    const data = { id: "123", name: "test" };
    expect(assertFound(data, TestError)).toBe(data);
  });

  it("throws when data is null", () => {
    expect(() => assertFound(null, TestError, "Not found"))
      .toThrow("Not found");
  });

  it("throws when data is undefined", () => {
    expect(() => assertFound(undefined, TestError))
      .toThrow("Resource not found");
  });
});

describe("unwrapQuery", () => {
  it("returns data when no error and data exists", () => {
    const data = { id: "1", name: "Test" };
    const result = unwrapQuery(data, null, TestError);
    expect(result).toBe(data);
  });

  it("throws on error before checking data", () => {
    const error = { message: "failed", code: "XX000" };
    expect(() => unwrapQuery({ id: "1" }, error, TestError))
      .toThrow("Database query failed");
  });

  it("throws not_found when data is null and no error", () => {
    expect(() => unwrapQuery(null, null, TestError, { notFoundMsg: "Gone" }))
      .toThrow("Gone");
  });
});

describe("unwrapList", () => {
  it("returns data array when present", () => {
    const data = [{ id: "1" }, { id: "2" }];
    expect(unwrapList(data, null, TestError)).toBe(data);
  });

  it("returns empty array when data is null and no error", () => {
    expect(unwrapList(null, null, TestError)).toEqual([]);
  });

  it("throws on error", () => {
    const error = { message: "timeout", code: "XX000" };
    expect(() => unwrapList([], error, TestError, { internalMsg: "List failed" }))
      .toThrow("List failed");
  });
});

describe("assertOwnership", () => {
  it("returns row when organization_id matches", () => {
    const row = { organization_id: "tenant-1", name: "test" };
    expect(assertOwnership(row, "tenant-1", TestError)).toBe(row);
  });

  it("throws forbidden when organization_id does not match", () => {
    const row = { organization_id: "tenant-1", name: "test" };
    expect(() => assertOwnership(row, "tenant-2", TestError))
      .toThrow("Access denied");
  });

  it("uses custom message when provided", () => {
    const row = { organization_id: "a", name: "test" };
    expect(() => assertOwnership(row, "b", TestError, "Not yours"))
      .toThrow("Not yours");
  });
});
