import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdapterFilter, MysqlConnectionConfig } from "@dash/core";
import {
  MysqlAdapter,
  createMysqlAdapter,
  parseMysqlConnectionString,
} from "./adapter.ts";

describe("parseMysqlConnectionString", () => {
  it("reads host, port, user, password, and database", () => {
    expect(
      parseMysqlConnectionString("mysql://reader:s3cret@mysql.internal:25060/analytics"),
    ).toEqual({
      host: "mysql.internal",
      port: 25060,
      database: "analytics",
      user: "reader",
      password: "s3cret",
      ssl: undefined,
    });
  });

  it("maps ssl-mode onto the ssl flag and ignores other query keys", () => {
    expect(
      parseMysqlConnectionString(
        "mysql://reader@mysql.internal/analytics?ssl-mode=REQUIRED&charset=utf8mb4",
      ),
    ).toMatchObject({
      host: "mysql.internal",
      database: "analytics",
      ssl: true,
    });
  });

  it("rejects a non-mysql scheme", () => {
    expect(() => parseMysqlConnectionString("postgres://localhost/dash")).toThrow(
      /mysql:\/\//,
    );
  });
});

const NOT_READY = "MySQL test cluster is not ready. Start it with `pnpm test:services:start`.";

function clusterEndpoint(): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
  const port = Number(process.env.DASH_TEST_MYSQL_PORT ?? 33029);
  if (!Number.isInteger(port) || port < 1) {
    throw new Error(`Invalid DASH_TEST_MYSQL_PORT: ${process.env.DASH_TEST_MYSQL_PORT}`);
  }
  return {
    host: process.env.DASH_TEST_MYSQL_HOST ?? "127.0.0.1",
    port,
    database: process.env.DASH_TEST_MYSQL_DATABASE ?? "dash",
    user: process.env.DASH_TEST_MYSQL_USER ?? "dash",
    password: process.env.DASH_TEST_MYSQL_PASSWORD ?? "dash",
  };
}

function clusterConfig(overrides: Partial<MysqlConnectionConfig> = {}): MysqlConnectionConfig {
  const endpoint = clusterEndpoint();
  return {
    kind: "mysql",
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
  return `mysql://${user}:${password}@${endpoint.host}:${endpoint.port}/${endpoint.database}`;
}

async function requireCluster(adapter: MysqlAdapter): Promise<void> {
  const result = await adapter.testConnection();
  if (!result.ok) {
    throw new Error(`${NOT_READY} ${result.message}`);
  }
}

describe("MysqlAdapter against the test cluster", () => {
  let adapter: MysqlAdapter;

  beforeAll(async () => {
    adapter = MysqlAdapter.fromConfig(clusterConfig());
    await requireCluster(adapter);
  });

  afterAll(async () => {
    await adapter.close();
  });

  it("reports a successful connection test", async () => {
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.message).toBe("Connected to MySQL");
  });

  it("groups real tables and views into resources", async () => {
    const schema = await adapter.introspectSchema();
    expect(schema.kind).toBe("mysql");
    expect(schema.resources.map((resource) => resource.name)).toEqual([
      "metrics",
      "orders",
      "paid_orders",
      "revenue",
    ]);

    const orders = schema.resources.find((resource) => resource.name === "orders");
    expect(orders).toMatchObject({
      namespace: "dash",
      kind: "table",
    });
    expect(orders?.columns).toEqual([
      { name: "id", type: "int", nullable: false },
      { name: "total", type: "int", nullable: false },
      { name: "status", type: "varchar", nullable: false },
      { name: "region", type: "varchar", nullable: true },
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
      { filters: [{ column: "status", op: "neq", value: "open" }], ids: [1, 2, 4, 5] },
      { filters: [{ column: "total", op: "gt", value: 25 }], ids: [4] },
      { filters: [{ column: "total", op: "gte", value: 25 }], ids: [2, 4] },
      { filters: [{ column: "total", op: "lt", value: 10 }], ids: [3] },
      { filters: [{ column: "total", op: "lte", value: 10 }], ids: [1, 3] },
      { filters: [{ column: "id", op: "in", value: [2, 4] }], ids: [2, 4] },
      { filters: [{ column: "status", op: "like", value: "p%" }], ids: [1, 2, 4] },
      { filters: [{ column: "status", op: "like", value: "P%" }], ids: [5] },
      { filters: [{ column: "region", op: "ilike", value: "%EUROPE%" }], ids: [1, 2, 5] },
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

  it("returns DATE as a calendar string and BIGINT beyond MAX_SAFE_INTEGER as a string", async () => {
    const result = await adapter.query({
      resource: "metrics",
      columns: ["billed_on", "amount"],
      limit: 1,
    });
    expect(result.rows).toEqual([{ billed_on: "2026-01-15", amount: "9007199254740993" }]);
  });
});

describe("MysqlAdapter connection setup", () => {
  beforeAll(async () => {
    const probe = MysqlAdapter.fromConfig(clusterConfig());
    try {
      await requireCluster(probe);
    } finally {
      await probe.close();
    }
  });

  it("connects with a connection string", async () => {
    const adapter = createMysqlAdapter({
      kind: "mysql",
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
    const adapter = MysqlAdapter.fromConfig(
      clusterConfig({ password: "not-the-cluster-password" }),
    );
    try {
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.message.toLowerCase()).toMatch(/password|auth|access denied/);
    } finally {
      await adapter.close();
    }
  });

  it("reports failure when ssl is required against a self-signed cluster certificate", async () => {
    const adapter = MysqlAdapter.fromConfig(clusterConfig({ ssl: true }));
    try {
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/SSL|certificate|CERT|self[- ]signed/i);
    } finally {
      await adapter.close();
    }
  });

  it("reports failure when ssl is set on a connection string", async () => {
    const adapter = createMysqlAdapter({
      kind: "mysql",
      connectionString: connectionString(),
      ssl: true,
    });
    try {
      const result = await adapter.testConnection();
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/SSL|certificate|CERT|self[- ]signed/i);
    } finally {
      await adapter.close();
    }
  });

  it("closes the pool", async () => {
    const adapter = MysqlAdapter.fromConfig(clusterConfig());
    await requireCluster(adapter);
    await adapter.close();
    const result = await adapter.testConnection();
    expect(result.ok).toBe(false);
  });
});
