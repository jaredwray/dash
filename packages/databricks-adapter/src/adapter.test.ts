import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { QueryValidationError, type AdapterFilter, type DatabricksConnectionConfig } from "@dash/core";
import {
  DatabricksAdapter,
  createDatabricksAdapter,
  databricksPublicSummary,
  parseDatabricksConnectionString,
  toConnectionOptions,
  type DatabricksClient,
} from "./adapter.ts";

const NOT_READY =
  "Databricks SQL test cluster is not ready. Start it with `pnpm test:services:start`.";

function clusterEndpoint(): {
  host: string;
  port: number;
  httpPath: string;
  token: string;
  catalog: string;
  schema: string;
} {
  const port = Number(process.env.DASH_TEST_DATABRICKS_PORT ?? 14439);
  if (!Number.isInteger(port) || port < 1) {
    throw new Error(`Invalid DASH_TEST_DATABRICKS_PORT: ${process.env.DASH_TEST_DATABRICKS_PORT}`);
  }
  const warehouse = process.env.DASH_TEST_DATABRICKS_WAREHOUSE ?? "dash";
  return {
    host: process.env.DASH_TEST_DATABRICKS_HOST ?? "127.0.0.1",
    port,
    httpPath: process.env.DASH_TEST_DATABRICKS_HTTP_PATH ?? `/sql/1.0/warehouses/${warehouse}`,
    token: process.env.DASH_TEST_DATABRICKS_TOKEN ?? "dash",
    catalog: process.env.DASH_TEST_DATABRICKS_CATALOG ?? "dash",
    schema: process.env.DASH_TEST_DATABRICKS_SCHEMA ?? "analytics",
  };
}

function clusterConfig(
  overrides: Partial<DatabricksConnectionConfig> = {},
): DatabricksConnectionConfig {
  const endpoint = clusterEndpoint();
  return {
    kind: "databricks",
    host: endpoint.host,
    httpPath: endpoint.httpPath,
    token: endpoint.token,
    catalog: endpoint.catalog,
    schema: endpoint.schema,
    apiEndpoint: `http://${endpoint.host}:${endpoint.port}`,
    ...overrides,
  };
}

function connectionString(): string {
  const endpoint = clusterEndpoint();
  const token = encodeURIComponent(endpoint.token);
  return `databricks://token:${token}@${endpoint.host}:${endpoint.port}${endpoint.httpPath}?catalog=${endpoint.catalog}&schema=${endpoint.schema}`;
}

async function requireCluster(adapter: DatabricksAdapter): Promise<void> {
  const result = await adapter.testConnection();
  if (!result.ok) {
    throw new Error(`${NOT_READY} ${result.message}`);
  }
}

function fakeClient(result: {
  rows?: Record<string, unknown>[];
  fields?: Array<{ name: string; type: string; nullable?: boolean }>;
  fail?: Error;
}): DatabricksClient & { query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  const query = vi.fn(async () => {
    if (result.fail) {
      throw result.fail;
    }
    return {
      rows: result.rows ?? [],
      fields: (result.fields ?? []).map((field) => ({
        name: field.name,
        type: field.type,
        nullable: field.nullable ?? true,
      })),
    };
  });
  return {
    query,
    end: vi.fn(async () => undefined),
  };
}

describe("DatabricksAdapter", () => {
  it("reports a failed connection without throwing", async () => {
    const client = fakeClient({ fail: new Error("connect ECONNREFUSED") });
    const adapter = new DatabricksAdapter(client, { catalog: "dash", schema: "analytics" });
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
          data_type: "INT",
          is_nullable: "NO",
        },
        {
          namespace: "analytics",
          name: "paid_orders",
          table_type: "VIEW",
          column_name: "id",
          data_type: "VARCHAR",
          is_nullable: "YES",
        },
        {
          namespace: "analytics",
          name: "revenue",
          table_type: "MATERIALIZED VIEW",
          column_name: "month",
          data_type: "STRING",
          is_nullable: "NO",
        },
        {
          namespace: "analytics",
          name: "preview_table",
          table_type: "PREVIEW",
          column_name: "id",
          data_type: "INT",
          is_nullable: "NO",
        },
        {
          namespace: "analytics",
          name: "orders",
          table_type: "BASE TABLE",
          column_name: "",
          data_type: "INT",
          is_nullable: "NO",
        },
      ],
    });
    const adapter = new DatabricksAdapter(client, { catalog: "dash", schema: "analytics" });
    const schema = await adapter.introspectSchema();
    expect(schema.kind).toBe("databricks");
    expect(schema.resources.map((resource) => resource.kind)).toEqual(["table", "view", "view", "table"]);
    expect(schema.resources[0]?.columns).toEqual([
      { name: "id", type: "INT", nullable: false },
    ]);
    expect(schema.resources[1]?.columns[0]).toEqual({
      name: "id",
      type: "STRING",
      nullable: true,
    });
    expect(schema.resources[2]?.kind).toBe("view");
    expect(schema.resources[3]?.kind).toBe("table");
  });

  it("returns field types and marks a full page truncated", async () => {
    const client = fakeClient({
      rows: [{ month: "2026-01" }, { month: "2026-02" }],
      fields: [{ name: "month", type: "STRING", nullable: false }],
    });
    const adapter = new DatabricksAdapter(client, { catalog: "dash", schema: "analytics" });
    const result = await adapter.query({ resource: "revenue", columns: ["month"], limit: 1 });
    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual([{ month: "2026-01" }]);
    expect(result.truncated).toBe(true);
    expect(result.columns).toEqual([{ name: "month", type: "STRING", nullable: false }]);
    expect(String(client.query.mock.calls[0]?.[0])).toContain(
      "SELECT `month` FROM `dash`.`analytics`.`revenue`",
    );
    await adapter.close();
    expect(client.end).toHaveBeenCalledOnce();
  });

  it("parses a connection string without echoing the token in errors", () => {
    expect(
      parseDatabricksConnectionString(
        "databricks://token:dapi-secret@adb-1.12.azuredatabricks.net/sql/1.0/warehouses/abc?catalog=main&schema=default",
      ),
    ).toMatchObject({
      host: "adb-1.12.azuredatabricks.net",
      httpPath: "/sql/1.0/warehouses/abc",
      token: "dapi-secret",
      catalog: "main",
      schema: "default",
    });
    expect(() => parseDatabricksConnectionString("postgres://token:super-secret@host/sql")).toThrow(
      /databricks:\/\//,
    );
    let rejected = "";
    try {
      toConnectionOptions({
        kind: "databricks",
        connectionString: "databricks://token:super-secret@127.0.0.1/not-a-warehouse?catalog=dash",
      });
    } catch (error) {
      rejected = error instanceof Error ? error.message : "";
    }
    expect(rejected).toMatch(/HTTP path/);
    expect(rejected).not.toContain("super-secret");
    expect(
      toConnectionOptions({
        kind: "databricks",
        connectionString:
          "databricks://token:from-uri@127.0.0.1/sql/1.0/warehouses/uri?catalog=main&schema=default",
        token: "from-field",
        catalog: "other",
      }),
    ).toMatchObject({ token: "from-field", catalog: "other", warehouseId: "uri" });
    expect(
      parseDatabricksConnectionString(
        "databricks://token:dash@127.0.0.1/sql/1.0/endpoints/abc",
      ).httpPath,
    ).toBe("/sql/1.0/endpoints/abc");
    expect(() =>
      parseDatabricksConnectionString("databricks://token:bad%zz@127.0.0.1/sql/1.0/warehouses/abc"),
    ).toThrow(QueryValidationError);
    expect(
      databricksPublicSummary({
        kind: "databricks",
        host: "adb-1.12.azuredatabricks.net",
        httpPath: "/sql/1.0/warehouses/abc",
        token: "not a token",
        catalog: "main",
      }),
    ).toEqual({
      host: "adb-1.12.azuredatabricks.net",
      warehouse: "abc",
      catalog: "main",
      schema: "",
      endpoint: "adb-1.12.azuredatabricks.net",
    });
    expect(() =>
      createDatabricksAdapter({
        kind: "databricks",
        host: "not a host",
        httpPath: "/sql/1.0/warehouses/dash",
        token: "dash",
        catalog: "dash",
      }),
    ).toThrow(/^Invalid Databricks SQL host$/);
  });

  it("rejects an invalid host before opening a client", () => {
    expect(() =>
      createDatabricksAdapter({
        kind: "databricks",
        host: "not a host",
        httpPath: "/sql/1.0/warehouses/dash",
        token: "dash",
        catalog: "dash",
      }),
    ).toThrow(/^Invalid Databricks SQL host$/);
  });
});

describe("DatabricksAdapter against the test cluster", () => {
  let adapter: DatabricksAdapter;

  beforeAll(async () => {
    adapter = DatabricksAdapter.fromConfig(clusterConfig());
    await requireCluster(adapter);
  });

  afterAll(async () => {
    await adapter.close();
  });

  it("reports a successful connection test", async () => {
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.message).toBe("Connected to Databricks SQL");
  });

  it("groups real tables and views into resources", async () => {
    const schema = await adapter.introspectSchema();
    expect(schema.kind).toBe("databricks");
    expect(schema.resources.map((resource) => resource.name)).toEqual([
      "orders",
      "paid_orders",
      "revenue",
    ]);

    const orders = schema.resources.find((resource) => resource.name === "orders");
    expect(orders).toMatchObject({ namespace: "analytics", kind: "table" });
    expect(orders?.columns).toEqual([
      { name: "id", type: "INT", nullable: false },
      { name: "total", type: "INT", nullable: false },
      { name: "status", type: "STRING", nullable: false },
      { name: "region", type: "STRING", nullable: true },
      { name: "note", type: "STRING", nullable: true },
    ]);

    const paid = schema.resources.find((resource) => resource.name === "paid_orders");
    expect(paid?.kind).toBe("view");
    expect(paid?.columns.map((column) => column.name)).toEqual(["id", "total", "status", "region"]);
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
      { name: "amount", type: "INT", nullable: true },
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
      expect(result.rows.map((row) => row.id), JSON.stringify(testCase.filters)).toEqual(testCase.ids);
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
    expect(exact.truncated).toBe(false);
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

describe("DatabricksAdapter connection setup", () => {
  beforeAll(async () => {
    const probe = DatabricksAdapter.fromConfig(clusterConfig());
    try {
      await requireCluster(probe);
    } finally {
      await probe.close();
    }
  });

  it("connects with a connection string", async () => {
    const adapter = createDatabricksAdapter({
      kind: "databricks",
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

  it("reports failure when the warehouse rejects the token", async () => {
    const adapter = DatabricksAdapter.fromConfig(clusterConfig({ token: "wrong-token" }));
    try {
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/token/i);
    } finally {
      await adapter.close();
    }
  });

  it("closes the client", async () => {
    const adapter = DatabricksAdapter.fromConfig(clusterConfig());
    await requireCluster(adapter);
    await adapter.close();
    const result = await adapter.testConnection();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/closed/);
  });
});
