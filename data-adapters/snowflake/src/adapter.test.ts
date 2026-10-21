import { describe, expect, it, vi } from "vitest";
import {
  SnowflakeAdapter,
  parseSnowflakeConnectionString,
  toConnectionOptions,
  type SqlClient,
} from "./adapter.ts";

function createClient(rows: Record<string, unknown>[] = []): SqlClient & {
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async () => ({
    rows,
    fields: rows[0]
      ? Object.keys(rows[0]).map((name) => ({ name }))
      : [],
  }));
  return {
    query,
    end: vi.fn(async () => undefined),
  };
}

describe("SnowflakeAdapter", () => {
  it("reports a successful connection test", async () => {
    const client = createClient([{ ok: 1 }]);
    const adapter = new SnowflakeAdapter(client);
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    expect(client.query).toHaveBeenCalledWith('SELECT 1 AS "ok"');
    await adapter.close();
    expect(client.end).toHaveBeenCalled();
  });

  it("groups introspection rows into resources", async () => {
    const client = createClient([
      {
        namespace: "PUBLIC",
        name: "ORDERS",
        table_type: "BASE TABLE",
        column_name: "ID",
        data_type: "NUMBER",
        is_nullable: "NO",
      },
      {
        namespace: "PUBLIC",
        name: "ORDERS",
        table_type: "BASE TABLE",
        column_name: "TOTAL",
        data_type: "NUMBER",
        is_nullable: "YES",
      },
    ]);
    const adapter = new SnowflakeAdapter(client);
    const schema = await adapter.introspectSchema();
    expect(schema.kind).toBe("snowflake");
    expect(schema.resources).toHaveLength(1);
    expect(schema.resources[0]?.columns.map((column) => column.name)).toEqual([
      "ID",
      "TOTAL",
    ]);
  });

  it("runs a compiled select and returns rows", async () => {
    const client = createClient([{ MONTH: "2026-01", AMOUNT: 10 }]);
    const adapter = new SnowflakeAdapter(client);
    const result = await adapter.query({
      resource: "revenue",
      columns: ["month", "amount"],
      limit: 10,
    });
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]?.AMOUNT).toBe(10);
    expect(String(client.query.mock.calls[0]?.[0])).toBe(
      "SELECT IDENTIFIER(?), IDENTIFIER(?) FROM IDENTIFIER(?) LIMIT ? OFFSET ?",
    );
    expect(client.query.mock.calls[0]?.[1]).toEqual(["month", "amount", "revenue", 10, 0]);
  });

  it("fails a connection test when account or user is missing", async () => {
    const adapter = SnowflakeAdapter.fromConfig({
      kind: "snowflake",
      user: "analyst",
    });
    const result = await adapter.testConnection();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/account and user/);
  });
});

describe("Snowflake connection config", () => {
  it("parses a snowflake:// URL", () => {
    const parsed = parseSnowflakeConnectionString(
      "snowflake://analyst@xy12345.us-east-1/ANALYTICS/PUBLIC?warehouse=COMPUTE_WH&role=SYSADMIN",
    );
    expect(parsed).toEqual({
      account: "xy12345.us-east-1",
      user: "analyst",
      password: undefined,
      database: "ANALYTICS",
      schema: "PUBLIC",
      warehouse: "COMPUTE_WH",
      role: "SYSADMIN",
      authenticator: undefined,
    });
  });

  it("rejects an unsupported authenticator", () => {
    expect(() =>
      parseSnowflakeConnectionString(
        "snowflake://analyst@xy12345/ANALYTICS/PUBLIC?authenticator=http://evil.example",
      ),
    ).toThrow(/authenticator/);
  });

  it("rejects a non-snowflake URL scheme", () => {
    expect(() => parseSnowflakeConnectionString("postgres://localhost/db")).toThrow(
      /snowflake:\/\//,
    );
  });

  it("rejects an account that is not a Snowflake locator", () => {
    expect(() =>
      toConnectionOptions({
        kind: "snowflake",
        account: "https://evil.example",
        user: "analyst",
      }),
    ).toThrow(/Invalid Snowflake account/);
  });

  it("maps adapter config onto session options", () => {
    expect(
      toConnectionOptions({
        kind: "snowflake",
        account: "xy12345",
        user: "analyst",
        warehouse: "COMPUTE_WH",
        database: "ANALYTICS",
        schema: "PUBLIC",
      }),
    ).toEqual({
      account: "xy12345",
      username: "analyst",
      password: undefined,
      warehouse: "COMPUTE_WH",
      database: "ANALYTICS",
      schema: "PUBLIC",
      role: undefined,
      authenticator: undefined,
    });
  });
});
