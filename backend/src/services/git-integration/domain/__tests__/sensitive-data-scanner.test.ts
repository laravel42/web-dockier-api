import { describe, expect, it } from "vitest";
import { analyzeSensitiveDataFromText } from "../analysis.js";
import { scanSensitiveData } from "../sensitive-data-scanner.js";

describe("scanSensitiveData", () => {
  it("detects sensitive columns in PostgreSQL schemas with lowercase types", () => {
    const sql = [
      "CREATE TABLE users (",
      "  id uuid PRIMARY KEY,",
      "  email varchar(255),",
      "  password_hash text",
      ");",
    ].join("\n");

    const fields = scanSensitiveData({ "schema.sql": sql }, {});

    expect(fields.some((f) => f.field === "email" && f.sensitivity === "personal")).toBe(true);
    expect(fields.some((f) => f.field === "password_hash")).toBe(false);
  });

  it("still flags plaintext password columns", () => {
    const sql = [
      "CREATE TABLE legacy_users (",
      "  id uuid PRIMARY KEY,",
      "  plain_password varchar(255)",
      ");",
    ].join("\n");

    const fields = scanSensitiveData({ "schema.sql": sql }, {});

    expect(fields.some((f) => f.field === "plain_password" && f.sensitivity === "secret")).toBe(true);
  });

  it("skips conventional hashed password column names", () => {
    const sql = [
      "CREATE TABLE users (",
      "  id uuid PRIMARY KEY,",
      "  password varchar(255),",
      "  password_hash text",
      ");",
    ].join("\n");

    const fields = scanSensitiveData({ "schema.sql": sql }, {});

    expect(fields.some((f) => f.field === "password")).toBe(false);
    expect(fields.some((f) => f.field === "password_hash")).toBe(false);
  });
});

describe("analyzeSensitiveDataFromText", () => {
  it("returns grouped tables for uploaded schema text", () => {
    const sql = [
      "CREATE TABLE customers (",
      "  id serial PRIMARY KEY,",
      "  phone text,",
      "  credit_card_number varchar(19)",
      ");",
    ].join("\n");

    const result = analyzeSensitiveDataFromText(sql);

    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]?.name).toBe("customers");
    expect(result.tables[0]?.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(["phone", "credit_card_number"]),
    );
  });

  it("returns empty results for blank schema text", () => {
    expect(analyzeSensitiveDataFromText("   ")).toEqual({
      tables: [],
      summary: { totalTables: 0, highRiskTables: 0, criticalFindings: [] },
    });
  });
});
