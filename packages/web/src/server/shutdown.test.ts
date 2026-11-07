import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAdapter } from "./adapters/registry.ts";
import { getDb } from "./db.ts";
import { ServerClosingError, closeServerResources } from "./shutdown.ts";
import { destroyAppDatabase, useFreshAppDatabase } from "./test-db.ts";

// The shutdown flag is process-wide. Vitest runs each test file in its own process.
describe("server shutdown", () => {
  beforeAll(async () => {
    await useFreshAppDatabase();
    await closeServerResources();
  });

  afterAll(async () => {
    await destroyAppDatabase();
  });

  it("refuses a new app database client after the closers run", async () => {
    await expect(getDb()).rejects.toBeInstanceOf(ServerClosingError);
  });

  it("refuses a new data source adapter after the closers run", () => {
    expect(() =>
      getAdapter("shutdown-test", {
        kind: "postgres",
        connectionString: "postgres://dash:dash@127.0.0.1:54329/dash",
      }),
    ).toThrow(ServerClosingError);
  });
});
