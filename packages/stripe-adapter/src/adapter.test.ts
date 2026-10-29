import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StripeAdapter, createStripeAdapter, stripePublicSummary } from "./adapter.ts";
import type { StripeConnectionConfig } from "@dash/core";

const NOT_READY = "Stripe test cluster is not ready. Start it with `pnpm test:services:start`.";

function clusterConfig(overrides: Partial<StripeConnectionConfig> = {}): StripeConnectionConfig {
  const port = Number(process.env.DASH_TEST_STRIPE_PORT ?? 12119);
  if (!Number.isInteger(port) || port < 1) {
    throw new Error("Invalid DASH_TEST_STRIPE_PORT");
  }
  const host = process.env.DASH_TEST_STRIPE_HOST ?? "127.0.0.1";
  return {
    kind: "stripe",
    apiKey: process.env.DASH_TEST_STRIPE_KEY ?? "sk_test_dash",
    apiEndpoint: `http://${host}:${port}`,
    ...overrides,
  };
}

async function requireCluster(adapter: StripeAdapter): Promise<void> {
  const result = await adapter.testConnection();
  if (!result.ok) {
    throw new Error(`${NOT_READY} ${result.message}`);
  }
}

describe("StripeAdapter against the test cluster", () => {
  let adapter: StripeAdapter;

  beforeAll(async () => {
    adapter = StripeAdapter.fromConfig(clusterConfig());
    await requireCluster(adapter);
  });

  afterAll(async () => {
    await adapter?.close();
  });

  it("reports a successful connection test", async () => {
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/reachable/i);
  });

  it("lists customers, charges, invoices, and subscriptions", async () => {
    const schema = await adapter.introspectSchema();
    expect(schema.kind).toBe("stripe");
    expect(schema.resources.map((resource) => resource.name)).toEqual([
      "customers",
      "charges",
      "invoices",
      "subscriptions",
    ]);
    expect(schema.resources[0]?.kind).toBe("collection");
  });

  it("returns the named fixture customers", async () => {
    const result = await adapter.query({
      resource: "customers",
      filters: [{ column: "email", op: "ilike", value: "%@example.com" }],
      orderBy: [{ column: "id", direction: "asc" }],
    });
    expect(result.rows.map((row) => row.email)).toEqual([
      "ada@example.com",
      "grace@example.com",
      "lin@example.com",
    ]);
    expect(result.truncated).toBe(false);
  });

  it("filters charges locally when Stripe's list API has no status parameter", async () => {
    const result = await adapter.query({
      resource: "charges",
      columns: ["id", "amount", "status"],
      filters: [{ column: "status", op: "eq", value: "succeeded" }],
      orderBy: [{ column: "amount", direction: "asc" }],
    });
    expect(result.rows).toEqual([
      { id: "ch_1", amount: 1000, status: "succeeded" },
      { id: "ch_2", amount: 2500, status: "succeeded" },
      { id: "ch_4", amount: 4000, status: "succeeded" },
    ]);
    expect(result.truncated).toBe(false);
  });

  it("pushes a customer email filter to the Search API", async () => {
    const result = await adapter.query({
      resource: "customers",
      filters: [{ column: "email", op: "eq", value: "ada@example.com" }],
    });
    expect(result.rows.map((row) => row.id)).toEqual(["cus_ada"]);
    const port = Number(process.env.DASH_TEST_STRIPE_PORT ?? 12119);
    const host = process.env.DASH_TEST_STRIPE_HOST ?? "127.0.0.1";
    const key = process.env.DASH_TEST_STRIPE_KEY ?? "sk_test_dash";
    const logged = await fetch(`http://${host}:${port}/v1/_requests`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = (await logged.json()) as { requests: string[] };
    const decoded = decodeURIComponent(body.requests.join("\n"));
    expect(decoded).toContain('email:"ada@example.com"');
  });

  it("matches a case-insensitive email pattern", async () => {
    const result = await adapter.query({
      resource: "customers",
      filters: [{ column: "email", op: "ilike", value: "%EXAMPLE.COM" }],
      orderBy: [{ column: "name", direction: "asc" }],
    });
    expect(result.rowCount).toBe(3);
  });

  it("does not mark an exact page as truncated", async () => {
    const exact = await adapter.query({
      resource: "charges",
      filters: [{ column: "status", op: "eq", value: "succeeded" }],
      limit: 3,
    });
    expect(exact.rowCount).toBe(3);
    expect(exact.truncated).toBe(false);
    const partial = await adapter.query({
      resource: "charges",
      filters: [{ column: "status", op: "eq", value: "succeeded" }],
      limit: 2,
    });
    expect(partial.rowCount).toBe(2);
    expect(partial.truncated).toBe(true);
  });

  it("reads the second page when the offset passes the first page", async () => {
    const result = await adapter.query({ resource: "customers", limit: 10, offset: 100 });
    expect(result.rows.map((row) => row.id)).toEqual(["cus_x002", "cus_x001", "cus_x000"]);
    expect(result.truncated).toBe(false);
  });

  it("sorts an amount that is not on the first list page", async () => {
    const result = await adapter.query({
      resource: "charges",
      columns: ["id"],
      orderBy: [{ column: "id", direction: "asc" }],
      limit: 1,
    });
    expect(result.rows).toEqual([{ id: "ch_1" }]);
  });

  it("keeps a customer on the inclusive created bound", async () => {
    const result = await adapter.query({
      resource: "customers",
      columns: ["id"],
      filters: [
        { column: "created", op: "gte", value: 1769904000 },
        { column: "created", op: "gt", value: 1767225600 },
      ],
      orderBy: [{ column: "id", direction: "asc" }],
    });
    expect(result.rows).toEqual([{ id: "cus_grace" }, { id: "cus_lin" }]);
  });

  it("rejects an unknown cursor from the fixture", async () => {
    const port = Number(process.env.DASH_TEST_STRIPE_PORT ?? 12119);
    const host = process.env.DASH_TEST_STRIPE_HOST ?? "127.0.0.1";
    const key = process.env.DASH_TEST_STRIPE_KEY ?? "sk_test_dash";
    const response = await fetch(`http://${host}:${port}/v1/charges?limit=1&starting_after=ch_missing`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { message?: string } };
    expect(body.error?.message).toBe("Unknown cursor");
  });

  it("rejects a bad key without echoing it", async () => {
    const wrong = createStripeAdapter(clusterConfig({ apiKey: "sk_test_wrongkey" }));
    try {
      const result = await wrong.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/rejected the api key/i);
      expect(result.message).not.toContain("sk_test_wrongkey");
    } finally {
      await wrong.close();
    }
  });

  it("omits the key from the public summary", () => {
    const summary = stripePublicSummary(clusterConfig());
    expect(summary.mode).toBe("test");
    expect(JSON.stringify(summary)).not.toContain("sk_test_dash");
  });
});
