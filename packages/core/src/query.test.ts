import { describe, expect, it } from "vitest";
import { QueryValidationError, normalizeAdapterQuery, splitResourceName } from "./query.ts";

describe("splitResourceName", () => {
  it("parses schema-qualified SQL names", () => {
    expect(splitResourceName("public.orders")).toEqual({
      namespace: "public",
      name: "orders",
    });
    expect(splitResourceName("orders")).toEqual({ name: "orders" });
  });

  it("rejects unsafe identifiers", () => {
    expect(() => splitResourceName("orders;drop")).toThrow(QueryValidationError);
    expect(() => splitResourceName("a.b.c")).toThrow(QueryValidationError);
  });
});

describe("normalizeAdapterQuery", () => {
  it("fills defaults and keeps a structured query", () => {
    const query = normalizeAdapterQuery({
      resource: "public.revenue",
      columns: ["month", "amount"],
      filters: [{ column: "region", op: "eq", value: "EU" }],
      orderBy: [{ column: "month", direction: "asc" }],
    });
    expect(query.limit).toBe(1000);
    expect(query.offset).toBe(0);
    expect(query.columns).toEqual(["month", "amount"]);
  });

  it("rejects bad operators, limits, and `in` values", () => {
    expect(() =>
      normalizeAdapterQuery({
        resource: "t",
        filters: [{ column: "id", op: "like-not" as never, value: "x" }],
      }),
    ).toThrow(QueryValidationError);
    expect(() =>
      normalizeAdapterQuery({
        resource: "t",
        filters: [{ column: "id", op: "in", value: "1" }],
      }),
    ).toThrow(/array/);
    expect(() => normalizeAdapterQuery({ resource: "t", limit: 0 })).toThrow(/limit/);
    expect(() => normalizeAdapterQuery({ resource: "t", offset: -1 })).toThrow(/offset/);
  });
});
