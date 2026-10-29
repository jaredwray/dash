import { QueryValidationError } from "@dash/core";
import { describe, expect, it } from "vitest";
import { INTROSPECT_SQL, compileSelect } from "./sql.ts";

describe("compileSelect", () => {
  it("parameterizes filters, limit, and offset", () => {
    const compiled = compileSelect({
      resource: "public.orders",
      columns: ["id", "total"],
      filters: [
        { column: "status", op: "eq", value: "paid" },
        { column: "total", op: "gte", value: 10 },
        { column: "id", op: "in", value: [1, 2, 3] },
      ],
      orderBy: [{ column: "total", direction: "desc" }],
      limit: 50,
      offset: 10,
    });
    expect(compiled.text).toBe(
      'SELECT "id", "total" FROM "public"."orders" WHERE "status" = $1 AND "total" >= $2 AND "id" IN ($3, $4, $5) ORDER BY "total" DESC LIMIT $6 OFFSET $7',
    );
    expect(compiled.values).toEqual(["paid", 10, 1, 2, 3, 50, 10]);
  });

  it("quotes identifiers and rejects injection in the resource name", () => {
    expect(() => compileSelect({ resource: "orders;drop table users" })).toThrow(
      QueryValidationError,
    );
    const compiled = compileSelect({ resource: "monthly_revenue" });
    expect(compiled.text.startsWith('SELECT * FROM "monthly_revenue"')).toBe(true);
    expect(compileSelect({ resource: "analytics.order-items" }).text).toContain(
      '"analytics"."order-items"',
    );
  });

  it("rejects a catalog-qualified resource", () => {
    expect(() => compileSelect({ resource: "dev.analytics.orders" })).toThrow(
      /Redshift resource must be schema\.table/,
    );
  });

  it("keeps Redshift system schemas out of introspection", () => {
    expect(INTROSPECT_SQL).toContain("'pg_catalog'");
    expect(INTROSPECT_SQL).toContain("'information_schema'");
    expect(INTROSPECT_SQL).toContain("'pg_internal'");
    expect(INTROSPECT_SQL).toContain("'pg_automv'");
    expect(INTROSPECT_SQL).toContain("'pg_auto_copy'");
    expect(INTROSPECT_SQL).toContain("LIMIT 10001");
    expect(INTROSPECT_SQL).not.toContain("catalog_history");
  });

  it("compiles null comparisons without binding null", () => {
    const compiled = compileSelect({
      resource: "orders",
      columns: ["id"],
      filters: [
        { column: "note", op: "eq", value: null },
        { column: "region", op: "neq", value: null },
      ],
      limit: 5,
    });
    expect(compiled.text).toContain('"note" IS NULL');
    expect(compiled.text).toContain('"region" IS NOT NULL');
    expect(compiled.values).toEqual([5, 0]);
  });

  it("rejects an in list past the cap and an in list that contains null", () => {
    expect(() =>
      compileSelect({
        resource: "orders",
        filters: [{ column: "id", op: "in", value: Array.from({ length: 1001 }, (_, index) => index) }],
      }),
    ).toThrow(/at most 1000/);
    expect(() =>
      compileSelect({
        resource: "orders",
        filters: [{ column: "id", op: "in", value: [1, null] }],
      }),
    ).toThrow(/null/);
  });
});
