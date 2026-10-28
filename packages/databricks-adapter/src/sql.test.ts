import { QueryValidationError } from "@dash/core";
import { describe, expect, it } from "vitest";
import { compileSelect, introspectSql } from "./sql.ts";

const context = { catalog: "dash", schema: "analytics" };

describe("compileSelect", () => {
  it("binds filters and inlines limit and offset", () => {
    const compiled = compileSelect(
      {
        resource: "analytics.orders",
        columns: ["id", "total"],
        filters: [
          { column: "status", op: "eq", value: "paid" },
          { column: "total", op: "gte", value: 10 },
          { column: "id", op: "in", value: [1, 2, 3] },
          { column: "region", op: "ilike", value: "%EUROPE%" },
          { column: "note", op: "eq", value: null },
        ],
        orderBy: [{ column: "total", direction: "desc" }],
        limit: 50,
        offset: 10,
      },
      context,
    );
    expect(compiled.text).toBe(
      "SELECT `id`, `total` FROM `dash`.`analytics`.`orders` WHERE CAST(`status` AS VARCHAR) = :p0 AND `total` >= :p1 AND `id` IN (:p2, :p3, :p4) AND CAST(`region` AS VARCHAR) ILIKE :p5 AND `note` IS NULL ORDER BY `total` DESC LIMIT 51 OFFSET 10",
    );
    expect(compiled.params).toEqual([
      { name: "p0", type: "STRING", value: "paid" },
      { name: "p1", type: "INT", value: 10 },
      { name: "p2", type: "INT", value: 1 },
      { name: "p3", type: "INT", value: 2 },
      { name: "p4", type: "INT", value: 3 },
      { name: "p5", type: "STRING", value: "%EUROPE%" },
    ]);
    expect(compiled.limit).toBe(50);
    expect(compiled.lookAhead).toBe(true);
  });

  it("sends values outside int32 as BIGINT and rejects mixed IN lists", () => {
    const compiled = compileSelect(
      {
        resource: "orders",
        filters: [{ column: "id", op: "eq", value: 3_000_000_000 }],
      },
      context,
    );
    expect(compiled.params[0]).toEqual({ name: "p0", type: "BIGINT", value: 3_000_000_000 });
    expect(() =>
      compileSelect(
        {
          resource: "orders",
          filters: [{ column: "id", op: "in", value: [1, 1.5] }],
        },
        context,
      ),
    ).toThrow(/one type/);
  });

  it("qualifies a catalog and quotes hyphenated identifiers", () => {
    const compiled = compileSelect(
      { resource: "main.sales.order-items", columns: ["order-id"] },
      context,
    );
    expect(compiled.text.startsWith("SELECT `order-id` FROM `main`.`sales`.`order-items`")).toBe(true);
  });

  it("qualifies an unqualified resource with the default schema", () => {
    const compiled = compileSelect({ resource: "orders" }, context);
    expect(compiled.text.startsWith("SELECT * FROM `dash`.`analytics`.`orders`")).toBe(true);
  });

  it("rejects injection and a missing schema", () => {
    expect(() => compileSelect({ resource: "orders;drop table users" }, context)).toThrow(
      QueryValidationError,
    );
    expect(() => compileSelect({ resource: "orders" }, { catalog: "dash" })).toThrow(/default schema/);
    expect(() => compileSelect({ resource: "orders" }, { catalog: "dash;drop" })).toThrow(
      QueryValidationError,
    );
    expect(() =>
      compileSelect(
        {
          resource: "orders",
          filters: [{ column: "total", op: "gt", value: null }],
        },
        context,
      ),
    ).toThrow(/null/);
    expect(() =>
      compileSelect(
        {
          resource: "orders",
          filters: [{ column: "id", op: "in", value: [] }],
        },
        context,
      ),
    ).toThrow(QueryValidationError);
  });

  it("builds an information schema query from validated names", () => {
    expect(introspectSql("dash", "analytics")).toContain("`dash`.`information_schema`.`columns`");
    expect(introspectSql("dash", "analytics")).toContain("c.table_schema = 'analytics'");
    expect(introspectSql("dash", "analytics")).toContain("LIMIT 10001");
    expect(introspectSql("dash")).toContain("NOT IN ('information_schema', 'system')");
    expect(() => introspectSql("dash;drop")).toThrow(QueryValidationError);
  });
});
