import { describe, it, expect } from "vitest";
import { scanSensitiveData } from "../sensitive-data-scanner";

describe("scanSensitiveData", () => {
  describe("SQL migration parsing", () => {
    it("extracts fields from CREATE TABLE statements", () => {
      const files = {
        "migrations/001_users.sql": `
          CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            password_hash TEXT NOT NULL,
            name VARCHAR(100),
            created_at TIMESTAMP DEFAULT NOW()
          );
        `,
      };
      const result = scanSensitiveData(files, {});
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(r => r.field === "email" && r.sensitivity === "personal")).toBe(true);
      expect(result.some(r => r.field === "password_hash" && r.sensitivity === "secret")).toBe(true);
      expect(result.some(r => r.field === "name" && r.sensitivity === "personal")).toBe(true);
    });

    it("excludes id, timestamps, and framework tables", () => {
      const files = {
        "migrations/001.sql": `
          CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255),
            created_at TIMESTAMP,
            updated_at TIMESTAMP
          );
          CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            data TEXT
          );
          CREATE TABLE failed_jobs (
            id SERIAL,
            payload TEXT
          );
        `,
      };
      const result = scanSensitiveData(files, {});
      expect(result.every(r => r.field !== "id")).toBe(true);
      expect(result.every(r => r.field !== "created_at")).toBe(true);
      expect(result.every(r => r.field !== "updated_at")).toBe(true);
      expect(result.every(r => r.entity !== "sessions")).toBe(true);
      expect(result.every(r => r.entity !== "failed_jobs")).toBe(true);
    });

    it("classifies sensitivity levels correctly", () => {
      const files = {
        "migrations/001.sql": `
          CREATE TABLE payments (
            id SERIAL PRIMARY KEY,
            credit_card VARCHAR(20),
            api_key TEXT,
            username VARCHAR(50),
            salary DECIMAL
          );
        `,
      };
      const result = scanSensitiveData(files, {});
      expect(result.find(r => r.field === "credit_card")?.sensitivity).toBe("sensitive");
      expect(result.find(r => r.field === "api_key")?.sensitivity).toBe("secret");
      expect(result.find(r => r.field === "username")?.sensitivity).toBe("personal");
      expect(result.find(r => r.field === "salary")?.sensitivity).toBe("sensitive");
    });
  });

  describe("PHP model parsing", () => {
    it("extracts fields from $fillable arrays", () => {
      const files = {
        "app/Models/User.php": `
          class User extends Model {
            protected $fillable = ['name', 'email', 'password', 'phone'];
          }
        `,
      };
      const result = scanSensitiveData({}, files);
      expect(result.some(r => r.field === "email" && r.entity === "User")).toBe(true);
      expect(result.some(r => r.field === "password" && r.sensitivity === "secret")).toBe(true);
      expect(result.some(r => r.field === "phone" && r.sensitivity === "personal")).toBe(true);
    });
  });

  describe("deduplication", () => {
    it("deduplicates fields found in both SQL and models", () => {
      const schema = {
        "migrations/001.sql": `CREATE TABLE users (id SERIAL, email VARCHAR(255));`,
      };
      const models = {
        "app/Models/User.php": `class User { protected $fillable = ['email']; }`,
      };
      const result = scanSensitiveData(schema, models);
      const emailEntries = result.filter(r => r.field === "email");
      expect(emailEntries.length).toBe(1);
    });
  });

  describe("sorting", () => {
    it("sorts secret before sensitive before personal", () => {
      const files = {
        "migrations/001.sql": `
          CREATE TABLE accounts (
            id SERIAL,
            email VARCHAR(255),
            api_key TEXT,
            credit_card VARCHAR(20)
          );
        `,
      };
      const result = scanSensitiveData(files, {});
      const sensitivities = result.map(r => r.sensitivity);
      const order = { secret: 0, sensitive: 1, personal: 2 };
      for (let i = 1; i < sensitivities.length; i++) {
        expect(order[sensitivities[i]]).toBeGreaterThanOrEqual(order[sensitivities[i - 1]]);
      }
    });
  });

  describe("empty input", () => {
    it("returns empty array for no files", () => {
      expect(scanSensitiveData({}, {})).toEqual([]);
    });

    it("returns empty array for files with no sensitive fields", () => {
      const files = {
        "migrations/001.sql": `CREATE TABLE settings (id SERIAL, key TEXT, value TEXT);`,
      };
      expect(scanSensitiveData(files, {}).length).toBe(0);
    });
  });
});
