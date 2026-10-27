import { describe, expect, it } from "vitest";
import { classifyField, parseSqlSchema } from "../utils/sqlSensitivity";

/**
 * This parser is the fallback the AI path falls back to, and its failure mode
 * is an empty list — which reads on screen as "this schema stores nothing
 * sensitive". It had no test while it lived inside ProjectDescription.tsx.
 */

describe("classifyField", () => {
  it("treats a hashed password as nothing to report", () => {
    // Flagging bcrypt columns as a leak trains users to ignore the whole list.
    for (const field of ["password", "password_hash", "encrypted_password", "password_digest", "bcrypt"]) {
      expect(classifyField(field), field).toBeNull();
    }
  });

  it("treats a plaintext credential column as secret", () => {
    for (const field of ["plain_password", "raw_password", "password_cleartext"]) {
      expect(classifyField(field), field).toEqual({
        sensitivity: "secret",
        reason: "Plaintext credential storage",
      });
    }
  });

  it("ranks secrets above sensitive above personal", () => {
    expect(classifyField("api_key")?.sensitivity).toBe("secret");
    expect(classifyField("ssn")?.sensitivity).toBe("sensitive");
    expect(classifyField("email")?.sensitivity).toBe("personal");
  });

  it("ignores framework boilerplate columns", () => {
    // `email_verified_at` matters: it contains "email" and would otherwise be
    // reported as a personal-data column on every Laravel schema.
    for (const field of ["id", "uuid", "created_at", "deleted_at", "remember_token", "email_verified_at"]) {
      expect(classifyField(field), field).toBeNull();
    }
  });

  it("returns null for an ordinary column", () => {
    expect(classifyField("title")).toBeNull();
    expect(classifyField("quantity")).toBeNull();
  });

  it("does not fire on a pattern buried inside a longer word", () => {
    // Each of these was a false positive while the rules matched raw
    // substrings: capacity/opacity read as "City", addressable as an address,
    // tokenized as an auth token, secretary as a secret.
    const cases: Array<[field: string, wouldHaveMatched: string]> = [
      ["capacity", "city"],
      ["opacity", "city"],
      ["velocity", "city"],
      ["electricity", "city"],
      ["addressable_type", "address"],
      ["tokenized_at", "token"],
      ["secretary_name", "secret"],
      ["headphones", "phone"],
    ];
    for (const [field] of cases) {
      expect(classifyField(field), field).toBeNull();
    }
  });

  it("lets the specific rule win over the generic one it sits inside", () => {
    expect(classifyField("ip_address")?.reason).toBe("IP address");
    expect(classifyField("secret_key")?.reason).toBe("Secret key");
    expect(classifyField("api_key")?.reason).toBe("API key");
    expect(classifyField("encryption_key")?.reason).toBe("Encryption key");
    // The generic rules still answer for everything else.
    expect(classifyField("billing_address")?.reason).toBe("Physical address");
    expect(classifyField("client_secret")?.reason).toBe("Secret value");
  });

  it("reads camelCase, plural and digit-suffixed columns as the same field", () => {
    expect(classifyField("ipAddress")?.reason).toBe("IP address");
    expect(classifyField("firstName")?.reason).toBe("First name");
    expect(classifyField("emails")?.reason).toBe("Email address");
    expect(classifyField("addresses")?.reason).toBe("Physical address");
    expect(classifyField("address2")?.reason).toBe("Physical address");
    expect(classifyField("billing_city")?.reason).toBe("City");
    expect(classifyField("telephone")?.reason).toBe("Phone number");
    expect(classifyField("healthcare_provider")?.reason).toBe("Health data");
  });
});

describe("parseSqlSchema — CREATE TABLE", () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS \`customers\` (
      id BIGINT NOT NULL,
      first_name VARCHAR(120),
      email VARCHAR(255) NOT NULL,
      password VARCHAR(255) NOT NULL,
      api_key VARCHAR(64),
      ssn VARCHAR(11)
    );
  `;

  it("reports the sensitive columns with their table", () => {
    const found = parseSqlSchema(sql);
    expect(found.map((f) => f.field)).toEqual(["first_name", "email", "api_key", "ssn"]);
    expect(found.every((f) => f.entity === "customers")).toBe(true);
  });

  it("carries the sensitivity and the reason", () => {
    const found = parseSqlSchema(sql);
    expect(found.find((f) => f.field === "ssn")).toEqual({
      entity: "customers",
      field: "ssn",
      sensitivity: "sensitive",
      reason: "Social Security Number",
    });
  });

  it("leaves the hashed password column out", () => {
    expect(parseSqlSchema(sql).map((f) => f.field)).not.toContain("password");
  });

  it("skips framework tables entirely", () => {
    const framework = `
      CREATE TABLE sessions (
        id VARCHAR(255),
        ip_address VARCHAR(45),
        payload TEXT
      );
      CREATE TABLE personal_access_tokens (
        token VARCHAR(64),
        name VARCHAR(255)
      );
    `;
    expect(parseSqlSchema(framework)).toEqual([]);
  });

  it("handles several user tables in one dump", () => {
    const multi = `
      CREATE TABLE patients (
        id INT,
        diagnosis TEXT
      );
      CREATE TABLE employees (
        id INT,
        salary DECIMAL(10)
      );
    `;
    expect(parseSqlSchema(multi).map((f) => `${f.entity}.${f.field}`)).toEqual([
      "patients.diagnosis",
      "employees.salary",
    ]);
  });
});

describe("parseSqlSchema — Laravel migrations", () => {
  it("reads Schema::create column definitions", () => {
    const migration = `
      Schema::create('invoices', function (Blueprint $table) {
          $table->id();
          $table->string('card_number');
          $table->string('billing_address');
          $table->timestamps();
      });
    `;
    expect(parseSqlSchema(migration)).toEqual([
      { entity: "invoices", field: "card_number", sensitivity: "sensitive", reason: "Card number" },
      { entity: "invoices", field: "billing_address", sensitivity: "personal", reason: "Physical address" },
    ]);
  });

  it("skips framework tables in migrations too", () => {
    const migration = `
      Schema::create('password_reset_tokens', function (Blueprint $table) {
          $table->string('email');
          $table->string('token');
      });
    `;
    expect(parseSqlSchema(migration)).toEqual([]);
  });
});

describe("parseSqlSchema — nothing to parse", () => {
  it("returns an empty list rather than throwing", () => {
    expect(parseSqlSchema("")).toEqual([]);
    expect(parseSqlSchema("SELECT * FROM users WHERE email = 'a@b.c';")).toEqual([]);
    expect(parseSqlSchema("-- just a comment")).toEqual([]);
  });
});
