import { describe, expect, it } from "vitest";
import { testConnectionConfig } from "./query.ts";

describe("testConnectionConfig", () => {
  it("reports an invalid MongoDB host as a failed connection test", async () => {
    const result = await testConnectionConfig({
      kind: "mongodb",
      host: "bad host",
      database: "dash",
    });
    expect(result.ok).toBe(false);
    expect(result.latencyMs).toBe(0);
    expect(result.message).toMatch(/host/i);
  });
});
