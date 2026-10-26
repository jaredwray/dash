import { QueryValidationError } from "@dash/core";
import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { compileFind, inferColumns, isListedCollection } from "./query.ts";

describe("compileFind", () => {
  it("builds a find command from scalars and validated names", () => {
    const compiled = compileFind(
      {
        resource: "dash.orders",
        columns: ["id", "total"],
        filters: [
          { column: "status", op: "eq", value: "paid" },
          { column: "total", op: "gte", value: 10 },
          { column: "id", op: "in", value: [1, 2, 3] },
        ],
        orderBy: [{ column: "total", direction: "desc" }],
        limit: 50,
        offset: 10,
      },
      "dash",
    );
    expect(compiled.collection).toBe("orders");
    expect(compiled.limit).toBe(50);
    expect(compiled.skip).toBe(10);
    expect(compiled.projection).toEqual({ id: 1, total: 1, _id: 0 });
    expect(compiled.sort).toEqual({ total: -1 });
    expect(compiled.filter.$and).toEqual([
      { status: "paid" },
      { total: { $gte: 10 } },
      { id: { $in: [1, 2, 3] } },
    ]);
  });

  it("anchors and escapes like patterns", () => {
    const compiled = compileFind(
      {
        resource: "orders",
        filters: [
          { column: "note", op: "like", value: "100%" },
          { column: "note", op: "ilike", value: "a.b_c" },
        ],
      },
      "dash",
    );
    expect(compiled.filter.$and).toEqual([
      { note: { $regex: "^100.*$" } },
      { note: { $regex: "^a\\.b.c$", $options: "i" } },
    ]);
  });

  it("matches SQL null comparisons instead of MongoDB's missing-field behavior", () => {
    const equalNull = compileFind(
      { resource: "orders", filters: [{ column: "note", op: "eq", value: null }] },
      "dash",
    );
    expect(equalNull.filter.$and).toEqual([{ note: null }, { note: { $exists: true } }]);

    const notEqual = compileFind(
      { resource: "orders", filters: [{ column: "note", op: "neq", value: "first" }] },
      "dash",
    );
    expect(notEqual.filter.$and).toEqual([
      { note: { $ne: "first" } },
      { note: { $ne: null } },
      { note: { $exists: true } },
    ]);

    const notEqualNull = compileFind(
      { resource: "orders", filters: [{ column: "note", op: "neq", value: null }] },
      "dash",
    );
    expect(notEqualNull.filter.$and).toEqual([
      { note: { $ne: null } },
      { note: { $exists: true } },
    ]);
  });

  it("keeps a dotted collection name unless it is exactly the connected database qualifier", () => {
    expect(compileFind({ resource: "orders" }, "dash").collection).toBe("orders");
    expect(compileFind({ resource: "dash.orders" }, "dash").collection).toBe("orders");
    expect(compileFind({ resource: "other.orders" }, "dash").collection).toBe("other.orders");
    expect(compileFind({ resource: "user-events" }, "dash").collection).toBe("user-events");
    expect(compileFind({ resource: "logs.events" }, "logs").collection).toBe("events");
    expect(compileFind({ resource: "logs.events.raw" }, "logs").collection).toBe("logs.events.raw");
    expect(
      compileFind({ resource: "logs.events" }, "logs", { literalCollectionExists: true }).collection,
    ).toBe("logs.events");
    expect(isListedCollection("orders")).toBe(true);
    expect(isListedCollection("user-events")).toBe(true);
    expect(isListedCollection("logs.events")).toBe(true);
    expect(isListedCollection("system.users")).toBe(false);
    expect(isListedCollection("bad$name")).toBe(false);
  });

  it("compares object ids and known date fields as BSON", () => {
    const types = new Map([
      [
        "orders",
        new Map([
          ["when", "date"],
          ["ref", "objectid"],
        ]),
      ],
    ]);
    const compiled = compileFind(
      {
        resource: "orders",
        filters: [
          { column: "_id", op: "eq", value: "656e6f5f6e6f5f6e6f5f6e6f" },
          { column: "ref", op: "eq", value: "656e6f5f6e6f5f6e6f5f6e6f" },
          { column: "when", op: "eq", value: "2026-01-02T03:04:05.000Z" },
          { column: "note", op: "eq", value: "2026-01-02T03:04:05.000Z" },
        ],
      },
      "dash",
      { columnTypes: types },
    );
    const clauses = compiled.filter.$and as Array<Record<string, unknown>>;
    expect(clauses[0]?._id).toBeInstanceOf(ObjectId);
    expect((clauses[0]?._id as ObjectId).toHexString()).toBe("656e6f5f6e6f5f6e6f5f6e6f");
    expect(clauses[1]?.ref).toBeInstanceOf(ObjectId);
    expect(clauses[2]?.when).toBeInstanceOf(Date);
    expect(clauses[3]).toEqual({ note: "2026-01-02T03:04:05.000Z" });
  });

  it("rejects operator objects, bad names, and system collections", () => {
    expect(() =>
      compileFind(
        {
          resource: "orders",
          filters: [{ column: "status", op: "eq", value: { $gt: "" } }],
        },
        "dash",
      ),
    ).toThrow(QueryValidationError);
    expect(compileFind({ resource: "orders;drop" }, "dash").collection).toBe("orders;drop");
    expect(() =>
      compileFind(
        { resource: "orders", filters: [{ column: "__proto__", op: "eq", value: 1 }] },
        "dash",
      ),
    ).toThrow(QueryValidationError);
    expect(() => compileFind({ resource: "system.users" }, "dash")).toThrow(QueryValidationError);
    expect(() => compileFind({ resource: "bad$name" }, "dash")).toThrow(QueryValidationError);
    expect(() =>
      compileFind(
        { resource: "orders", filters: [{ column: "id", op: "in", value: [] }] },
        "dash",
      ),
    ).toThrow(/non-empty array/);
  });
});

describe("inferColumns", () => {
  it("records bson kinds and marks missing or null fields nullable", () => {
    const columns = inferColumns([
      { _id: { _bsontype: "ObjectId" }, id: 1, note: "first" },
      { _id: { _bsontype: "ObjectId" }, id: 2, note: null, region: "EU" },
    ]);
    expect(columns).toEqual([
      { name: "_id", type: "objectid", nullable: false },
      { name: "id", type: "number", nullable: false },
      { name: "note", type: "string", nullable: true },
      { name: "region", type: "string", nullable: true },
    ]);
  });

  it("drops names that cannot be used in a structured query", () => {
    const columns = inferColumns([{ "customer-id": 1, "a.b": 2, status: "paid" }]);
    expect(columns.map((column) => column.name)).toEqual(["status"]);
  });
});
