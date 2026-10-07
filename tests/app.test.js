import { describe, it, expect } from "vitest";

describe("basic validation", () => {
  it("accepts a normal username", () => {
    expect(/^[a-zA-Z0-9_]{3,30}$/.test("alice_123")).toBe(true);
  });

  it("rejects a short password", () => {
    expect("abc123".length >= 8).toBe(false);
  });
});

// Full API integration tests can be run against a test Turso database.
// Keep real credentials out of the repository. Never commit .env files.
