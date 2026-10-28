import { type AdapterQuery, QueryValidationError } from "@dash/core";
import { describe, expect, it } from "vitest";
import { compileSelect } from "./sql.ts";

describe("compileSelect", () => {
  it.each<Partial<AdapterQuery>>([
    { resource: "orders` WHERE 1=1 --" },
    { columns: ["id`, SLEEP(1) --"] },
    { filters: [{ column: "status` OR 1=1 --", op: "eq", value: "paid" }] },
    { orderBy: [{ column: "id` --", direction: "asc" }] },
    { orderBy: [{ column: "id", direction: "desc; SELECT SLEEP(1)" as "desc" }] },
    { limit: "1; DROP TABLE orders" as unknown as number },
    { offset: "0 OR 1=1" as unknown as number },
  ])("rejects SQL syntax in structural input: %j", (input) => {
    expect(() => compileSelect({ resource: "orders", ...input })).toThrow(QueryValidationError);
  });

  it("keeps injection payloads out of SQL text, including IN values", () => {
    const payload = "paid' OR 1=1; -- ";
    const compiled = compileSelect({
      resource: "orders",
      filters: [
        { column: "status", op: "eq", value: payload },
        { column: "status", op: "in", value: [payload, "open"] },
      ],
    });
    expect(compiled.text).toBe(
      "SELECT * FROM `orders` WHERE `status` = ? AND `status` IN (?, ?) LIMIT ? OFFSET ?",
    );
    expect(compiled.values).toEqual([payload, payload, "open", 1000, 0]);
  });

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
      "SELECT `id`, `total` FROM `public`.`orders` WHERE `status` = ? AND `total` >= ? AND `id` IN (?, ?, ?) ORDER BY `total` DESC LIMIT ? OFFSET ?",
    );
    expect(compiled.values).toEqual(["paid", 10, 1, 2, 3, 50, 10]);
  });

  it("compiles ilike with LOWER because MySQL has no ILIKE", () => {
    const compiled = compileSelect({
      resource: "orders",
      columns: ["id"],
      filters: [{ column: "region", op: "ilike", value: "%EUROPE%" }],
      limit: 10,
    });
    expect(compiled.text).toBe(
      "SELECT `id` FROM `orders` WHERE LOWER(`region` COLLATE utf8mb4_bin) LIKE LOWER(?) LIMIT ? OFFSET ?",
    );
    expect(compiled.values).toEqual(["%EUROPE%", 10, 0]);
  });

  it("compiles like with a binary collation so it stays case-sensitive", () => {
    const compiled = compileSelect({
      resource: "orders",
      columns: ["id"],
      filters: [{ column: "status", op: "like", value: "p%" }],
      limit: 10,
    });
    expect(compiled.text).toBe(
      "SELECT `id` FROM `orders` WHERE `status` COLLATE utf8mb4_bin LIKE ? LIMIT ? OFFSET ?",
    );
    expect(compiled.values).toEqual(["p%", 10, 0]);
  });

  it("quotes identifiers and rejects injection in the resource name", () => {
    expect(() => compileSelect({ resource: "orders;drop table users" })).toThrow(
      QueryValidationError,
    );
    const compiled = compileSelect({ resource: "monthly_revenue" });
    expect(compiled.text.startsWith("SELECT * FROM `monthly_revenue`")).toBe(true);
  });
});
