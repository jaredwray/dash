import { describe, expect, it } from "vitest";
import { compareRows, matchesFilters, prepareStripeQuery, projectStripeObject } from "./query.ts";

describe("prepareStripeQuery", () => {
  it("sends searchable filters as a Stripe Search query", () => {
    const prepared = prepareStripeQuery({
      resource: "customers",
      filters: [
        { column: "email", op: "eq", value: "ada@example.com" },
        { column: "created", op: "gte", value: 1767225600 },
      ],
      limit: 10,
    });
    expect(prepared.search).toBe('email:"ada@example.com" AND created>=1767225600');
    expect(prepared.residual).toEqual([]);
    expect(prepared.limit).toBe(10);
  });

  it("sends a charge status filter to Search", () => {
    const prepared = prepareStripeQuery({
      resource: "charges",
      filters: [{ column: "status", op: "eq", value: "succeeded" }],
    });
    expect(prepared.search).toBe('status:"succeeded"');
    expect(prepared.residual).toEqual([]);
  });

  it("keeps a non-searchable paid filter local", () => {
    const prepared = prepareStripeQuery({
      resource: "charges",
      filters: [{ column: "paid", op: "eq", value: true }],
    });
    expect(prepared.search).toBeNull();
    expect(prepared.residual.map((filter) => filter.column)).toEqual(["paid"]);
  });

  it("quotes search values so they cannot break out of the query", () => {
    const prepared = prepareStripeQuery({
      resource: "customers",
      filters: [{ column: "email", op: "eq", value: 'ada" OR email:"other' }],
    });
    expect(prepared.search).toBe('email:"ada\\" OR email:\\"other"');
  });

  it("rejects pattern filters on numeric columns", () => {
    expect(() =>
      prepareStripeQuery({
        resource: "charges",
        filters: [{ column: "amount", op: "like", value: "%1000%" }],
      }),
    ).toThrow(/string column/i);
  });

  it("rejects a qualified resource name", () => {
    expect(() => prepareStripeQuery({ resource: "stripe.customers" })).toThrow(
      /object name/i,
    );
  });

  it("rejects an unknown column", () => {
    expect(() =>
      prepareStripeQuery({ resource: "customers", columns: ["password"] }),
    ).toThrow(/unknown stripe column/i);
  });

  it("caps in-lists", () => {
    expect(() =>
      prepareStripeQuery({
        resource: "charges",
        filters: [{ column: "id", op: "in", value: Array.from({ length: 1001 }, (_, i) => `ch_${i}`) }],
      }),
    ).toThrow(/1000/);
  });

  it("rejects null entries in an in-list", () => {
    expect(() =>
      prepareStripeQuery({
        resource: "charges",
        filters: [{ column: "id", op: "in", value: ["ch_1", null] }],
      }),
    ).toThrow(/scalar/i);
  });
});

describe("Stripe rows", () => {
  it("flattens an expanded customer to its id", () => {
    expect(
      projectStripeObject("charges", {
        id: "ch_1",
        amount: 1000,
        currency: "usd",
        status: "succeeded",
        paid: true,
        customer: { id: "cus_ada", object: "customer" },
        created: 1767225600,
      }).customer,
    ).toBe("cus_ada");
  });

  it("matches ilike and null equality locally", () => {
    const row = projectStripeObject("customers", {
      id: "cus_ada",
      email: "Ada@Example.com",
      name: null,
      created: 1,
    });
    expect(matchesFilters(row, [{ column: "email", op: "ilike", value: "%example.com" }])).toBe(true);
    expect(matchesFilters(row, [{ column: "name", op: "eq", value: null }])).toBe(true);
    expect(matchesFilters(row, [{ column: "name", op: "neq", value: null }])).toBe(false);
  });

  it("rejects an object that omits a required column", () => {
    expect(() =>
      projectStripeObject("charges", {
        id: "ch_1",
        currency: "usd",
        status: "succeeded",
        paid: true,
        created: 1,
      }),
    ).toThrow(/unexpected/i);
  });

  it("orders strings by UTF-16 code unit", () => {
    expect(compareRows({ id: "A" }, { id: "a" }, [{ column: "id", direction: "asc" }])).toBeLessThan(0);
    expect(compareRows({ id: "a" }, { id: "A" }, [{ column: "id", direction: "asc" }])).toBeGreaterThan(0);
  });
});
