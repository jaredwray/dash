import { describe, expect, it } from "vitest";
import { DemoAdapter } from "./demo.ts";

describe("DemoAdapter", () => {
  it("introspects sample tables and queries with filters", async () => {
    const adapter = new DemoAdapter();
    const connection = await adapter.testConnection();
    expect(connection.ok).toBe(true);
    const schema = await adapter.introspectSchema();
    expect(schema.resources.map((resource) => resource.name)).toEqual([
      "monthly_revenue",
      "product_sales",
      "monthly_signups",
    ]);
    const result = await adapter.query({
      resource: "monthly_revenue",
      columns: ["month", "region", "revenue"],
      filters: [{ column: "region", op: "eq", value: "Europe" }],
      orderBy: [{ column: "month", direction: "asc" }],
      limit: 5,
    });
    expect(result.rowCount).toBe(5);
    expect(result.rows.every((row) => row.region === "Europe")).toBe(true);
    await adapter.close();
  });
});
