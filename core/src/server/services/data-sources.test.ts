import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../auth.ts";
import { closeDb } from "../db.ts";
import { createDataSource, deleteDataSource, listDataSources } from "./data-sources.ts";

describe("data source records", () => {
  beforeEach(() => {
    process.env.DASH_SECRET = "unit-test-secret";
    process.env.DASH_SEED_DEMO = "false";
    process.env.DASH_DATABASE_PATH = join(
      mkdtempSync(join(tmpdir(), "dash-ds-")),
      "test.sqlite",
    );
    closeDb();
  });

  afterEach(() => {
    closeDb();
  });

  it("adds and removes a data source", async () => {
    const admin = await createUser({
      email: "admin@example.com",
      name: "Admin",
      password: "password123",
      role: "admin",
    });
    const created = createDataSource({
      name: "Finance warehouse",
      description: "Quarterly metrics",
      config: { kind: "demo" },
      createdBy: admin.id,
    });
    expect(created.name).toBe("Finance warehouse");
    expect(listDataSources().map((source) => source.id)).toContain(created.id);
    expect(deleteDataSource(created.id)).toBe(true);
    expect(listDataSources()).toEqual([]);
    expect(deleteDataSource(created.id)).toBe(false);
  });
});
