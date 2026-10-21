import { QueryValidationError } from "@dash/core";
import { describe, expect, it } from "vitest";
import { compileSelect } from "./sql.ts";

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
  });
});
