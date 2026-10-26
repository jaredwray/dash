import { QueryValidationError } from "@dash/core";
import { describe, expect, it } from "vitest";
import { compileSelect, introspectSql } from "./sql.ts";

const context = { projectId: "dash", dataset: "analytics" };

describe("compileSelect", () => {
  it("binds filters, limit, and offset with named parameters", () => {
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
      "SELECT `id`, `total` FROM `dash`.`analytics`.`orders` WHERE `status` = @p0 AND `total` >= @p1 AND `id` IN (@p2, @p3, @p4) AND LOWER(CAST(`region` AS STRING)) LIKE LOWER(CAST(@p5 AS STRING)) AND `note` IS NULL ORDER BY `total` DESC LIMIT @p6 OFFSET @p7",
    );
    expect(compiled.params).toEqual([
      { name: "p0", type: "STRING", value: "paid" },
      { name: "p1", type: "INT64", value: 10 },
      { name: "p2", type: "INT64", value: 1 },
      { name: "p3", type: "INT64", value: 2 },
      { name: "p4", type: "INT64", value: 3 },
      { name: "p5", type: "STRING", value: "%EUROPE%" },
      { name: "p6", type: "INT64", value: 50 },
      { name: "p7", type: "INT64", value: 10 },
    ]);
    expect(compiled.limit).toBe(50);
  });

  it("qualifies an unqualified resource with the default dataset and quotes hyphenated projects", () => {
    const compiled = compileSelect(
      { resource: "orders" },
      { projectId: "my-project", dataset: "analytics" },
    );
    expect(compiled.text.startsWith("SELECT * FROM `my-project`.`analytics`.`orders`")).toBe(true);
  });

  it("rejects injection and missing datasets", () => {
    expect(() => compileSelect({ resource: "orders;drop table users" }, context)).toThrow(
      QueryValidationError,
    );
    expect(() => compileSelect({ resource: "orders" }, { projectId: "dash" })).toThrow(
      /default dataset/,
    );
    expect(() => compileSelect({ resource: "orders" }, { projectId: "dash;drop" })).toThrow(
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
    expect(introspectSql("my-project", "analytics")).toContain(
      "`my-project.analytics.INFORMATION_SCHEMA.COLUMNS`",
    );
    expect(() => introspectSql("bad project", "analytics")).toThrow(QueryValidationError);
  });
});
