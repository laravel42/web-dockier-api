/**
 * Domain Error Base + Factory — Unit Tests
 *
 * `DomainError` is what the shared Fastify error handler switches on, and
 * `createDomainErrorClass` produces the per-service subclasses every domain
 * module throws. These tests pin EXISTING behaviour.
 */

import { describe, it, expect } from "vitest";
import { DomainError, createDomainErrorClass, type BaseDomainErrorCode } from "../errors.js";

const ALL_CODES: BaseDomainErrorCode[] = [
  "not_found",
  "forbidden",
  "bad_request",
  "conflict",
  "internal",
  "unauthorized",
  "precondition_failed",
  "too_many_requests",
  "service_unavailable",
];

describe("DomainError", () => {
  it("is an Error with the DomainError name", () => {
    const err = new DomainError("Not found", "not_found");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.name).toBe("DomainError");
  });

  it("exposes the message and code", () => {
    const err = new DomainError("Project not found", "not_found");
    expect(err.message).toBe("Project not found");
    expect(err.code).toBe("not_found");
  });

  it.each(ALL_CODES)("accepts the %s code", (code) => {
    expect(new DomainError("msg", code).code).toBe(code);
  });

  it("preserves an Error cause by reference", () => {
    const cause = new Error("connection reset");
    expect(new DomainError("Query failed", "internal", cause).cause).toBe(cause);
  });

  it("preserves a non-Error cause, such as a PostgREST error object", () => {
    const cause = { message: "duplicate key", code: "23505" };
    expect(new DomainError("Conflict", "conflict", cause).cause).toEqual(cause);
  });

  it("leaves cause undefined when none is given", () => {
    expect(new DomainError("msg", "bad_request").cause).toBeUndefined();
  });

  it("attaches metadata when provided", () => {
    const err = new DomainError("Query failed", "internal", undefined, {
      table: "projects",
      operation: "select",
    });
    expect(err.metadata).toEqual({ table: "projects", operation: "select" });
  });

  it("leaves metadata undefined when none is given", () => {
    expect(new DomainError("msg", "not_found").metadata).toBeUndefined();
  });

  it("still declares the metadata property (class field), it is just undefined", () => {
    const err = new DomainError("msg", "not_found", undefined, undefined);
    expect("metadata" in err).toBe(true);
    expect(err.metadata).toBeUndefined();
  });

  it("captures a stack trace", () => {
    expect(new DomainError("msg", "internal").stack).toContain("DomainError");
  });

  it("is catchable as an Error and narrowable with instanceof", () => {
    try {
      throw new DomainError("Forbidden", "forbidden");
    } catch (e: unknown) {
      expect(e instanceof DomainError).toBe(true);
      expect(e instanceof DomainError && e.code).toBe("forbidden");
    }
  });
});

describe("createDomainErrorClass", () => {
  const ProjectsError = createDomainErrorClass("ProjectsError");

  it("names the class and its instances after the given className", () => {
    expect(ProjectsError.name).toBe("ProjectsError");
    expect(new ProjectsError("msg", "not_found").name).toBe("ProjectsError");
  });

  it("produces instances that are DomainError and Error instances", () => {
    const err = new ProjectsError("Not found", "not_found");
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
  });

  it("forwards message, code, cause and metadata to DomainError", () => {
    const cause = { message: "duplicate key", code: "23505" };
    const err = new ProjectsError("Already exists", "conflict", cause, { table: "projects" });
    expect(err.message).toBe("Already exists");
    expect(err.code).toBe("conflict");
    expect(err.cause).toEqual(cause);
    expect(err.metadata).toEqual({ table: "projects" });
  });

  it("puts the class name in the stack trace", () => {
    expect(new ProjectsError("msg", "internal").stack).toContain("ProjectsError");
  });

  it("produces independent classes per call", () => {
    const DeployError = createDomainErrorClass("DeployError");
    const deployErr = new DeployError("msg", "internal");

    expect(deployErr).toBeInstanceOf(DomainError);
    expect(deployErr.name).toBe("DeployError");
    expect(new ProjectsError("msg", "internal").name).toBe("ProjectsError");
  });

  it("narrows codes at the type level only — the runtime accepts any base code", () => {
    const NarrowError = createDomainErrorClass<"not_found" | "internal">("NarrowError");
    expect(new NarrowError("msg", "not_found").code).toBe("not_found");
    expect(new NarrowError("msg", "internal").code).toBe("internal");
  });

  // The factory exposes no per-code static helpers (e.g. `ProjectsError.notFound`);
  // call sites use the constructor directly. Pinned so adding one is a deliberate change.
  it("exposes no static per-code helper functions", () => {
    const statics = Object.getOwnPropertyNames(ProjectsError).filter(
      (key) => !["length", "name", "prototype"].includes(key),
    );
    expect(statics).toEqual([]);
  });

  it("is catchable by the shared DomainError type the error handler switches on", () => {
    const thrown: unknown = new ProjectsError("Forbidden", "forbidden");
    expect(thrown instanceof DomainError).toBe(true);
    expect(thrown instanceof DomainError && thrown.code).toBe("forbidden");
  });
});
