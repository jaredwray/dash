import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdapterFilter, MongoConnectionConfig } from "@dash/core";
import { QueryValidationError } from "@dash/core";
import { MongoClient } from "mongodb";
import { MongoAdapter, createMongoAdapter } from "./adapter.ts";

const NOT_READY = "MongoDB test cluster is not ready. Start it with `pnpm test:services:start`.";

function clusterEndpoint(): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  authSource: string;
} {
  const port = Number(process.env.DASH_TEST_MONGODB_PORT ?? 27029);
  if (!Number.isInteger(port) || port < 1) {
    throw new Error(`Invalid DASH_TEST_MONGODB_PORT: ${process.env.DASH_TEST_MONGODB_PORT}`);
  }
  return {
    host: process.env.DASH_TEST_MONGODB_HOST ?? "127.0.0.1",
    port,
    database: process.env.DASH_TEST_MONGODB_DATABASE ?? "dash",
    user: process.env.DASH_TEST_MONGODB_USER ?? "dash",
    password: process.env.DASH_TEST_MONGODB_PASSWORD ?? "dash",
    authSource: process.env.DASH_TEST_MONGODB_AUTH_SOURCE ?? "admin",
  };
}

function clusterConfig(overrides: Partial<MongoConnectionConfig> = {}): MongoConnectionConfig {
  const endpoint = clusterEndpoint();
  return {
    kind: "mongodb",
    host: endpoint.host,
    port: endpoint.port,
    database: endpoint.database,
    user: endpoint.user,
    password: endpoint.password,
    authSource: endpoint.authSource,
    ...overrides,
  };
}

function connectionString(): string {
  const endpoint = clusterEndpoint();
  const user = encodeURIComponent(endpoint.user);
  const password = encodeURIComponent(endpoint.password);
  return `mongodb://${user}:${password}@${endpoint.host}:${endpoint.port}/${endpoint.database}?authSource=${endpoint.authSource}`;
}

async function requireCluster(adapter: MongoAdapter): Promise<void> {
  const result = await adapter.testConnection();
  if (!result.ok) {
    throw new Error(`${NOT_READY} ${result.message}`);
  }
}

describe("MongoAdapter against the test cluster", () => {
  let adapter: MongoAdapter;

  beforeAll(async () => {
    adapter = MongoAdapter.fromConfig(clusterConfig());
    await requireCluster(adapter);
    const existing = await adapter.query({
      resource: "orders",
      columns: ["id"],
      filters: [{ column: "id", op: "eq", value: 5 }],
      limit: 1,
    });
    if (existing.rowCount > 0) {
      return;
    }
    const endpoint = clusterEndpoint();
    const client = new MongoClient(`mongodb://${endpoint.host}:${endpoint.port}`, {
      auth: { username: endpoint.user, password: endpoint.password },
      authSource: endpoint.authSource,
    });
    try {
      await client.db(endpoint.database).collection("orders").insertOne({
        id: 5,
        total: 25,
        status: "hold",
        region: "Other",
      });
    } finally {
      await client.close();
    }
  });

  afterAll(async () => {
    await adapter.close();
  });

  it("reports a successful connection test", async () => {
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.message).toBe("Connected to MongoDB");
  });

  it("groups sampled collections and views into resources", async () => {
    const schema = await adapter.introspectSchema();
    expect(schema.kind).toBe("mongodb");
    expect(schema.resources.map((resource) => resource.name)).toEqual([
      "orders",
      "paid_orders",
      "revenue",
    ]);

    const orders = schema.resources.find((resource) => resource.name === "orders");
    expect(orders).toMatchObject({ namespace: "dash", kind: "collection" });
    expect(orders?.columns.map((column) => column.name)).toEqual([
      "_id",
      "id",
      "total",
      "status",
      "region",
      "note",
    ]);
    expect(orders?.columns.find((column) => column.name === "note")?.nullable).toBe(true);
    expect(orders?.columns.find((column) => column.name === "id")?.type).toBe("number");

    const paid = schema.resources.find((resource) => resource.name === "paid_orders");
    expect(paid?.kind).toBe("view");
    expect(paid?.columns.map((column) => column.name)).toEqual(["id", "total", "status", "region"]);
  });

  it("runs a compiled find and returns rows", async () => {
    const result = await adapter.query({
      resource: "revenue",
      columns: ["month", "amount"],
      orderBy: [{ column: "month", direction: "asc" }],
      limit: 10,
    });
    expect(result.rowCount).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.rows).toEqual([
      { month: "2026-01", amount: 10 },
      { month: "2026-02", amount: 20 },
      { month: "2026-03", amount: 15 },
    ]);
    expect(result.columns).toEqual([
      { name: "month", type: "unknown", nullable: true },
      { name: "amount", type: "unknown", nullable: true },
    ]);
  });

  it("applies each filter operator on the cluster", async () => {
    const cases: Array<{ filters: AdapterFilter[]; ids: number[] }> = [
      { filters: [{ column: "status", op: "eq", value: "open" }], ids: [3] },
      { filters: [{ column: "status", op: "neq", value: "open" }], ids: [1, 2, 4, 5] },
      { filters: [{ column: "total", op: "gt", value: 25 }], ids: [4] },
      { filters: [{ column: "total", op: "gte", value: 25 }], ids: [2, 4, 5] },
      { filters: [{ column: "total", op: "lt", value: 10 }], ids: [3] },
      { filters: [{ column: "total", op: "lte", value: 10 }], ids: [1, 3] },
      { filters: [{ column: "id", op: "in", value: [2, 4] }], ids: [2, 4] },
      { filters: [{ column: "status", op: "like", value: "p%" }], ids: [1, 2, 4] },
      { filters: [{ column: "region", op: "ilike", value: "%EUROPE%" }], ids: [1, 2] },
      { filters: [{ column: "note", op: "eq", value: null }], ids: [2, 4] },
      { filters: [{ column: "note", op: "neq", value: null }], ids: [1, 3] },
      { filters: [{ column: "note", op: "in", value: [null] }], ids: [2, 4] },
      { filters: [{ column: "note", op: "neq", value: "first" }], ids: [3] },
    ];

    for (const testCase of cases) {
      const result = await adapter.query({
        resource: "dash.orders",
        columns: ["id"],
        filters: testCase.filters,
        orderBy: [{ column: "id", direction: "asc" }],
        limit: 20,
      });
      expect(result.rows.map((row) => row.id)).toEqual(testCase.ids);
    }
  });

  it("honors offset and marks the page truncated when the limit is filled", async () => {
    const page = await adapter.query({
      resource: "dash.revenue",
      columns: ["month"],
      orderBy: [{ column: "month", direction: "asc" }],
      limit: 1,
      offset: 1,
    });
    expect(page.rows).toEqual([{ month: "2026-02" }]);
    expect(page.truncated).toBe(true);

    const exact = await adapter.query({
      resource: "revenue",
      columns: ["month"],
      limit: 3,
    });
    expect(exact.rowCount).toBe(3);
    expect(exact.truncated).toBe(true);
  });

  it("returns column metadata when the cluster sends no rows", async () => {
    const result = await adapter.query({
      resource: "orders",
      columns: ["id", "status"],
      filters: [{ column: "id", op: "eq", value: -1 }],
      limit: 5,
    });
    expect(result.rowCount).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.columns.map((column) => column.name)).toEqual(["id", "status"]);
  });

  it("reads a dotted collection literally when that collection exists", async () => {
    const endpoint = clusterEndpoint();
    const client = new MongoClient(`mongodb://${endpoint.host}:${endpoint.port}`, {
      auth: { username: endpoint.user, password: endpoint.password },
      authSource: endpoint.authSource,
    });
    const literal = client.db(endpoint.database).collection("dash.orders");
    try {
      await literal.deleteMany({});
      await literal.insertOne({ id: 99, marker: "literal" });
      const result = await adapter.query({
        resource: "dash.orders",
        columns: ["id", "marker"],
        limit: 10,
      });
      expect(result.rows).toEqual([{ id: 99, marker: "literal" }]);
    } finally {
      await literal.drop().catch(() => undefined);
      await client.close();
    }
  });

  it("matches an ObjectId _id from the hex string returned by a query", async () => {
    const sample = await adapter.query({ resource: "orders", limit: 1 });
    const id = sample.rows[0]?._id;
    expect(typeof id).toBe("string");
    const again = await adapter.query({
      resource: "orders",
      filters: [{ column: "_id", op: "eq", value: id }],
      limit: 5,
    });
    expect(again.rowCount).toBe(1);
    expect(again.rows[0]?._id).toBe(id);
  });

  it("rejects an operator object before it reaches the cluster", async () => {
    await expect(
      adapter.query({
        resource: "orders",
        filters: [{ column: "status", op: "eq", value: { $gt: "" } }],
      }),
    ).rejects.toBeInstanceOf(QueryValidationError);
  });
});

describe("MongoAdapter connection setup", () => {
  beforeAll(async () => {
    const probe = MongoAdapter.fromConfig(clusterConfig());
    try {
      await requireCluster(probe);
    } finally {
      await probe.close();
    }
  });

  it("connects with a connection string", async () => {
    const adapter = createMongoAdapter({
      kind: "mongodb",
      connectionString: connectionString(),
    });
    try {
      const result = await adapter.testConnection();
      expect(result.ok).toBe(true);
      const rows = await adapter.query({
        resource: "revenue",
        columns: ["amount"],
        filters: [{ column: "month", op: "eq", value: "2026-01" }],
        limit: 1,
      });
      expect(rows.rows).toEqual([{ amount: 10 }]);
    } finally {
      await adapter.close();
    }
  });

  it("reports a rejected password without echoing it", async () => {
    const adapter = MongoAdapter.fromConfig(
      clusterConfig({ password: "not-the-cluster-password" }),
    );
    try {
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.message.toLowerCase()).toMatch(/auth/);
      expect(result.message).not.toContain("not-the-cluster-password");
    } finally {
      await adapter.close();
    }
  });

  it(
    "reports failure when tls is required by a plaintext cluster",
    async () => {
      const adapter = MongoAdapter.fromConfig(clusterConfig({ tls: true }));
      try {
        const result = await adapter.testConnection();
        expect(result.ok).toBe(false);
        expect(result.message).toMatch(/TLS|SSL|ECONNRESET|alert|secure/i);
      } finally {
        await adapter.close();
      }
    },
    15_000,
  );

  it("closes the client", async () => {
    const adapter = MongoAdapter.fromConfig(clusterConfig());
    await requireCluster(adapter);
    await adapter.close();
    const result = await adapter.testConnection();
    expect(result.ok).toBe(false);
  });
});
