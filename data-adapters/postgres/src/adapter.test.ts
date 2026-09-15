import { describe, expect, it, vi } from "vitest";
import { PostgresAdapter, type SqlClient } from "./adapter.ts";

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

describe("PostgresAdapter", () => {
  it("reports a successful connection test", async () => {
    const client = createClient([{ ok: 1 }]);
    const adapter = new PostgresAdapter(client);
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    expect(client.query).toHaveBeenCalledWith("SELECT 1 AS ok");
    await adapter.close();
    expect(client.end).toHaveBeenCalled();
  });

  it("groups introspection rows into resources", async () => {
    const client = createClient([
      {
        namespace: "public",
        name: "orders",
        table_type: "BASE TABLE",
        column_name: "id",
        data_type: "integer",
        is_nullable: "NO",
      },
      {
        namespace: "public",
        name: "orders",
        table_type: "BASE TABLE",
        column_name: "total",
        data_type: "numeric",
        is_nullable: "YES",
      },
    ]);
    const adapter = new PostgresAdapter(client);
    const schema = await adapter.introspectSchema();
    expect(schema.kind).toBe("postgres");
    expect(schema.resources).toHaveLength(1);
    expect(schema.resources[0]?.columns.map((column) => column.name)).toEqual([
      "id",
      "total",
    ]);
  });

  it("runs a compiled select and returns rows", async () => {
    const client = createClient([{ month: "2026-01", amount: 10 }]);
    const adapter = new PostgresAdapter(client);
    const result = await adapter.query({
      resource: "revenue",
      columns: ["month", "amount"],
      limit: 10,
    });
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]?.amount).toBe(10);
    expect(String(client.query.mock.calls[0]?.[0])).toContain(
      'SELECT "month", "amount" FROM "revenue"',
    );
  });
});
