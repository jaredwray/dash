import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AdapterFilter, BigQueryConnectionConfig } from "@dash/core";
import { BigQueryAdapter, createBigQueryAdapter, type BigQueryClient } from "./adapter.ts";

const NOT_READY =
  "BigQuery test cluster is not ready. Start it with `pnpm test:services:start`.";

function clusterEndpoint(): { host: string; port: number; projectId: string; dataset: string } {
  const port = Number(process.env.DASH_TEST_BIGQUERY_PORT ?? 9059);
  if (!Number.isInteger(port) || port < 1) {
    throw new Error(`Invalid DASH_TEST_BIGQUERY_PORT: ${process.env.DASH_TEST_BIGQUERY_PORT}`);
  }
  return {
    host: process.env.DASH_TEST_BIGQUERY_HOST ?? "127.0.0.1",
    port,
    projectId: process.env.DASH_TEST_BIGQUERY_PROJECT ?? "dash",
    dataset: process.env.DASH_TEST_BIGQUERY_DATASET ?? "analytics",
  };
}

function clusterConfig(
  overrides: Partial<BigQueryConnectionConfig> = {},
): BigQueryConnectionConfig {
  const endpoint = clusterEndpoint();
  return {
    kind: "bigquery",
    projectId: endpoint.projectId,
    dataset: endpoint.dataset,
    apiEndpoint: `http://${endpoint.host}:${endpoint.port}`,
    ...overrides,
  };
}

async function requireCluster(adapter: BigQueryAdapter): Promise<void> {
  const result = await adapter.testConnection();
  if (!result.ok) {
    throw new Error(`${NOT_READY} ${result.message}`);
  }
}

function fakeClient(result: {
  rows?: Record<string, unknown>[];
  fields?: Array<{ name: string; type: string; mode?: string }>;
  datasets?: string[];
  fail?: Error;
}): BigQueryClient & { query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  const query = vi.fn(async () => {
    if (result.fail) {
      throw result.fail;
    }
    return { rows: result.rows ?? [], fields: result.fields ?? [] };
  });
  return {
    query,
    listDatasets: vi.fn(async () => result.datasets ?? []),
    end: vi.fn(async () => undefined),
  };
}

describe("BigQueryAdapter", () => {
  it("reports a failed connection without throwing", async () => {
    const client = fakeClient({ fail: new Error("connect ECONNREFUSED") });
    const adapter = new BigQueryAdapter(client, { projectId: "dash", dataset: "analytics" });
    const result = await adapter.testConnection();
    expect(result.ok).toBe(false);
    expect(result.message).toBe("connect ECONNREFUSED");
    expect(client.query).toHaveBeenCalledWith("SELECT 1 AS ok", [], 10_000);
  });

  it("groups introspection rows and treats NO as not nullable", async () => {
    const client = fakeClient({
      rows: [
        {
          namespace: "analytics",
          name: "orders",
          table_type: "BASE TABLE",
          column_name: "id",
          data_type: "INT64",
          is_nullable: "NO",
        },
        {
          namespace: "analytics",
          name: "paid_orders",
          table_type: "VIEW",
          column_name: "id",
          data_type: "INT64",
          is_nullable: "YES",
        },
      ],
    });
    const adapter = new BigQueryAdapter(client, { projectId: "dash", dataset: "analytics" });
    const schema = await adapter.introspectSchema();
    expect(schema.kind).toBe("bigquery");
    expect(schema.resources.map((resource) => resource.kind)).toEqual(["table", "view"]);
    expect(schema.resources[0]?.columns[0]).toEqual({
      name: "id",
      type: "INT64",
      nullable: false,
    });
    expect(schema.resources[1]?.columns[0]?.nullable).toBe(true);
  });

  it("lists datasets when the connection has no default dataset", async () => {
    const client = fakeClient({
      datasets: ["analytics"],
      rows: [
        {
          namespace: "analytics",
          name: "revenue",
          table_type: "BASE TABLE",
          column_name: "month",
          data_type: "STRING",
          is_nullable: "NO",
        },
      ],
    });
    const adapter = new BigQueryAdapter(client, { projectId: "dash" });
    const schema = await adapter.introspectSchema();
    expect(client.listDatasets).toHaveBeenCalledOnce();
    expect(schema.resources.map((resource) => resource.name)).toEqual(["revenue"]);
    expect(String(client.query.mock.calls[0]?.[0])).toContain(
      "`dash.analytics.INFORMATION_SCHEMA.COLUMNS`",
    );
  });

  it("returns field types and marks a full page truncated", async () => {
    const client = fakeClient({
      rows: [{ month: "2026-01" }],
      fields: [{ name: "month", type: "STRING", mode: "REQUIRED" }],
    });
    const adapter = new BigQueryAdapter(client, { projectId: "dash", dataset: "analytics" });
    const result = await adapter.query({ resource: "revenue", columns: ["month"], limit: 1 });
    expect(result.truncated).toBe(true);
    expect(result.columns).toEqual([{ name: "month", type: "STRING", nullable: false }]);
    expect(String(client.query.mock.calls[0]?.[0])).toContain("SELECT `month` FROM `dash`.`analytics`.`revenue`");
    await adapter.close();
    expect(client.end).toHaveBeenCalledOnce();
  });

  it("rejects an invalid project before opening a client", () => {
    expect(() =>
      createBigQueryAdapter({
        kind: "bigquery",
        projectId: "not a project",
      }),
    ).toThrow(/project id/);
  });
});

describe("BigQueryAdapter against the test cluster", () => {
  let adapter: BigQueryAdapter;

  beforeAll(async () => {
    adapter = BigQueryAdapter.fromConfig(clusterConfig());
    await requireCluster(adapter);
  });

  afterAll(async () => {
    await adapter.close();
  });

  it("reports a successful connection test", async () => {
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.message).toBe("Connected to BigQuery");
  });

  it("groups real tables and views into resources", async () => {
    const schema = await adapter.introspectSchema();
    expect(schema.kind).toBe("bigquery");
    expect(schema.resources.map((resource) => resource.name)).toEqual([
      "orders",
      "paid_orders",
      "revenue",
    ]);

    const orders = schema.resources.find((resource) => resource.name === "orders");
    expect(orders).toMatchObject({ namespace: "analytics", kind: "table" });
    expect(orders?.columns).toEqual([
      { name: "id", type: "INT64", nullable: true },
      { name: "total", type: "INT64", nullable: true },
      { name: "status", type: "STRING", nullable: true },
      { name: "region", type: "STRING", nullable: true },
      { name: "note", type: "STRING", nullable: true },
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
      { name: "month", type: "STRING", nullable: true },
      { name: "amount", type: "INTEGER", nullable: true },
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
      { filters: [{ column: "note", op: "eq", value: null }], ids: [2, 4] },
      { filters: [{ column: "note", op: "neq", value: null }], ids: [1, 3] },
    ];

    for (const testCase of cases) {
      const result = await adapter.query({
        resource: "analytics.orders",
        columns: ["id"],
        filters: testCase.filters,
        orderBy: [{ column: "id", direction: "asc" }],
        limit: 20,
      });
      expect(result.rows.map((row) => row.id), JSON.stringify(testCase.filters)).toEqual(
        testCase.ids,
      );
    }
  });

  it("honors offset and marks the page truncated when the limit is filled", async () => {
    const page = await adapter.query({
      resource: "analytics.revenue",
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

describe("BigQueryAdapter connection setup", () => {
  beforeAll(async () => {
    const probe = BigQueryAdapter.fromConfig(clusterConfig());
    try {
      await requireCluster(probe);
    } finally {
      await probe.close();
    }
  });

  it("connects through the factory helper", async () => {
    const adapter = createBigQueryAdapter(clusterConfig());
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

  it("reports failure when the emulator is not at the configured endpoint", async () => {
    const adapter = BigQueryAdapter.fromConfig(
      clusterConfig({ apiEndpoint: "http://127.0.0.1:1" }),
    );
    try {
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.message.length).toBeGreaterThan(0);
    } finally {
      await adapter.close();
    }
  });

  it("closes the client", async () => {
    const adapter = BigQueryAdapter.fromConfig(clusterConfig());
    await requireCluster(adapter);
    await adapter.close();
    const result = await adapter.testConnection();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/closed/);
  });
});
