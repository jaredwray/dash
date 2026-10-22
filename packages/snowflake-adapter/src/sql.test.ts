import { QueryValidationError } from "@dash/core";
import { describe, expect, it } from "vitest";
import { compileSelect } from "./sql.ts";

describe("compileSelect", () => {
  it("binds identifiers, filters, limit, and offset", () => {
    const compiled = compileSelect({
      resource: "analytics.orders",
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
      "SELECT IDENTIFIER(?), IDENTIFIER(?) FROM IDENTIFIER(?).IDENTIFIER(?) WHERE IDENTIFIER(?) = ? AND IDENTIFIER(?) >= ? AND IDENTIFIER(?) IN (?, ?, ?) ORDER BY IDENTIFIER(?) DESC LIMIT ? OFFSET ?",
    );
    expect(compiled.values).toEqual([
      "id",
      "total",
      "analytics",
      "orders",
      "status",
      "paid",
      "total",
      10,
      "id",
      1,
      2,
      3,
      "total",
      50,
      10,
    ]);
  });

  it("rejects injection in the resource name", () => {
    expect(() => compileSelect({ resource: "orders;drop table users" })).toThrow(
      QueryValidationError,
    );
    const compiled = compileSelect({ resource: "monthly_revenue" });
    expect(compiled.text.startsWith("SELECT * FROM IDENTIFIER(?)")).toBe(true);
    expect(compiled.values[0]).toBe("monthly_revenue");
  });
});
