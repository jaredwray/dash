import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdapterFilter, PostgresConnectionConfig } from "@dash/core";
import { PostgresAdapter, createPostgresAdapter } from "./adapter.ts";

const NOT_READY =
  "PostgreSQL test cluster is not ready. Start it with `pnpm test:services:start`.";

function clusterEndpoint(): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
  const port = Number(process.env.DASH_TEST_POSTGRES_PORT ?? 54329);
  if (!Number.isInteger(port) || port < 1) {
    throw new Error(`Invalid DASH_TEST_POSTGRES_PORT: ${process.env.DASH_TEST_POSTGRES_PORT}`);
  }
  return {
    host: process.env.DASH_TEST_POSTGRES_HOST ?? "127.0.0.1",
    port,
    database: process.env.DASH_TEST_POSTGRES_DATABASE ?? "dash",
    user: process.env.DASH_TEST_POSTGRES_USER ?? "dash",
    password: process.env.DASH_TEST_POSTGRES_PASSWORD ?? "dash",
  };
}

function clusterConfig(
  overrides: Partial<PostgresConnectionConfig> = {},
): PostgresConnectionConfig {
  const endpoint = clusterEndpoint();
  return {
    kind: "postgres",
    host: endpoint.host,
    port: endpoint.port,
    database: endpoint.database,
    user: endpoint.user,
    password: endpoint.password,
    ...overrides,
  };
}

function connectionString(): string {
  const endpoint = clusterEndpoint();
  const user = encodeURIComponent(endpoint.user);
  const password = encodeURIComponent(endpoint.password);
  return `postgres://${user}:${password}@${endpoint.host}:${endpoint.port}/${endpoint.database}`;
}

async function requireCluster(adapter: PostgresAdapter): Promise<void> {
  const result = await adapter.testConnection();
  if (!result.ok) {
    throw new Error(`${NOT_READY} ${result.message}`);
  }
}

describe("PostgresAdapter against the test cluster", () => {
  let adapter: PostgresAdapter;

  beforeAll(async () => {
    adapter = PostgresAdapter.fromConfig(clusterConfig());
    await requireCluster(adapter);
  });

  afterAll(async () => {
    await adapter.close();
  });

  it("reports a successful connection test", async () => {
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.message).toBe("Connected to PostgreSQL");
  });

  it("groups real tables and views into resources", async () => {
    const schema = await adapter.introspectSchema();
    expect(schema.kind).toBe("postgres");
    expect(schema.resources.map((resource) => resource.name)).toEqual([
      "orders",
      "paid_orders",
      "revenue",
    ]);

    const orders = schema.resources.find((resource) => resource.name === "orders");
    expect(orders).toMatchObject({
      namespace: "public",
      kind: "table",
    });
    expect(orders?.columns).toEqual([
      { name: "id", type: "integer", nullable: false },
      { name: "total", type: "integer", nullable: false },
      { name: "status", type: "text", nullable: false },
      { name: "region", type: "text", nullable: true },
      { name: "note", type: "text", nullable: true },
    ]);

    const paid = schema.resources.find((resource) => resource.name === "paid_orders");
    expect(paid?.kind).toBe("view");
    expect(paid?.columns.map((column) => column.name)).toEqual([
      "id",
      "total",
      "status",
      "region",
    ]);
  });

  it("runs a compiled select and returns rows", async () => {
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
      { filters: [{ column: "status", op: "neq", value: "open" }], ids: [1, 2, 4] },
      { filters: [{ column: "total", op: "gt", value: 25 }], ids: [4] },
      { filters: [{ column: "total", op: "gte", value: 25 }], ids: [2, 4] },
      { filters: [{ column: "total", op: "lt", value: 10 }], ids: [3] },
      { filters: [{ column: "total", op: "lte", value: 10 }], ids: [1, 3] },
      { filters: [{ column: "id", op: "in", value: [2, 4] }], ids: [2, 4] },
      { filters: [{ column: "status", op: "like", value: "p%" }], ids: [1, 2, 4] },
      { filters: [{ column: "region", op: "ilike", value: "%EUROPE%" }], ids: [1, 2] },
    ];

    for (const testCase of cases) {
      const result = await adapter.query({
        resource: "public.orders",
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
      resource: "public.revenue",
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
});

describe("PostgresAdapter connection setup", () => {
  beforeAll(async () => {
    const probe = PostgresAdapter.fromConfig(clusterConfig());
    try {
      await requireCluster(probe);
    } finally {
      await probe.close();
    }
  });

  it("connects with a connection string", async () => {
    const adapter = createPostgresAdapter({
      kind: "postgres",
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

  it("reports a rejected password from the cluster", async () => {
    const adapter = PostgresAdapter.fromConfig(
      clusterConfig({ password: "not-the-cluster-password" }),
    );
    try {
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.message.toLowerCase()).toMatch(/password|auth/);
    } finally {
      await adapter.close();
    }
  });

  it("reports failure when ssl is required by a plaintext cluster", async () => {
    const adapter = PostgresAdapter.fromConfig(clusterConfig({ ssl: true }));
    try {
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/SSL/);
    } finally {
      await adapter.close();
    }
  });

  it("reports failure when ssl is set on a connection string", async () => {
    const adapter = createPostgresAdapter({
      kind: "postgres",
      connectionString: connectionString(),
      ssl: true,
    });
    try {
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/SSL/);
    } finally {
      await adapter.close();
    }
  });

  it("closes the pool", async () => {
    const adapter = PostgresAdapter.fromConfig(clusterConfig());
    await requireCluster(adapter);
    await adapter.close();
    const result = await adapter.testConnection();
    expect(result.ok).toBe(false);
  });
});
