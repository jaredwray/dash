import { describe, expect, it } from "vitest";
import { testConnectionConfig } from "./query.ts";

describe("testConnectionConfig", () => {
  it("reports an invalid BigQuery project as a failed connection test", async () => {
    const result = await testConnectionConfig({
      kind: "bigquery",
      projectId: "not a project",
    });
    expect(result.ok).toBe(false);
    expect(result.latencyMs).toBe(0);
    expect(result.message).toMatch(/project/i);
  });

  it("reports an invalid Databricks SQL host as a failed connection test", async () => {
    const result = await testConnectionConfig({
      kind: "databricks",
      host: "not a host",
      httpPath: "/sql/1.0/warehouses/dash",
      token: "dash",
      catalog: "dash",
    });
    expect(result.ok).toBe(false);
    expect(result.latencyMs).toBe(0);
    expect(result.message).toMatch(/host/i);
    expect(result.message).not.toContain("not a host");
  });

  it("reports an invalid MySQL connection URI as a failed connection test", async () => {
    const result = await testConnectionConfig({
      kind: "mysql",
      connectionString: "postgres://localhost/dash",
    });
    expect(result.ok).toBe(false);
    expect(result.latencyMs).toBe(0);
    expect(result.message).toMatch(/mysql:\/\//);
  });

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

  it("reports an invalid Redshift host without echoing the password", async () => {
    const result = await testConnectionConfig({
      kind: "redshift",
      host: "not a host",
      database: "dash",
      user: "dash",
      password: "super-secret",
    });
    expect(result.ok).toBe(false);
    expect(result.latencyMs).toBe(0);
    expect(result.message).toMatch(/host/i);
    expect(result.message).not.toContain("not a host");
    expect(result.message).not.toContain("super-secret");
  });

  it("rejects a Redshift URI that tries to set driver options", async () => {
    const result = await testConnectionConfig({
      kind: "redshift",
      connectionString:
        "redshift://dash:super-secret@example.redshift.amazonaws.com/analytics?options=-c",
    });
    expect(result.ok).toBe(false);
    expect(result.latencyMs).toBe(0);
    expect(result.message).toMatch(/unsupported redshift connection parameter/i);
    expect(result.message).not.toMatch(/options/i);
    expect(result.message).not.toContain("super-secret");
  });

  it("rejects a Stripe URI that names another host without echoing the key", async () => {
    const result = await testConnectionConfig({
      kind: "stripe",
      connectionString: "stripe://sk_test_supersecret@evil.example?debug=1",
    });
    expect(result.ok).toBe(false);
    expect(result.latencyMs).toBe(0);
    expect(result.message).toMatch(/unsupported stripe connection parameter/i);
    expect(result.message).not.toContain("sk_test_supersecret");
    expect(result.message).not.toMatch(/debug/i);
    expect(result.message).not.toContain("evil.example");
  });
});
