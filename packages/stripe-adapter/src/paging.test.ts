import { afterEach, describe, expect, it, vi } from "vitest";
import { StripeAdapter } from "./adapter.ts";

const session = {
  kind: "stripe" as const,
  apiKey: "sk_test_dash",
  apiEndpoint: "http://127.0.0.1:12119",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function charge(id: string, amount: number, created: number): Record<string, unknown> {
  return {
    id,
    amount,
    currency: "usd",
    status: "failed",
    paid: false,
    customer: null,
    created,
  };
}

function customer(id: string): Record<string, unknown> {
  return { id, email: `${id}@example.com`, name: id, created: 1, currency: "usd" };
}

describe("Stripe paging", () => {
  it("sends an email equality filter on the Search request", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        object: "list",
        data: [customer("cus_ada")],
        has_more: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = StripeAdapter.fromConfig(session);
    await adapter.query({
      resource: "customers",
      filters: [{ column: "email", op: "eq", value: "ada@example.com" }],
    });
    const [url] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    const href = String(url);
    expect(decodeURIComponent(href)).toContain("/v1/customers/search");
    expect(decodeURIComponent(href)).toContain('email:"ada@example.com"');
    await adapter.close();
  });

  it("sorts across later pages instead of the first page only", async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      const href = String(url);
      if (!href.includes("starting_after=")) {
        return json({ object: "list", data: [charge("ch_b", 50, 2)], has_more: true });
      }
      expect(href).toContain("starting_after=ch_b");
      return json({ object: "list", data: [charge("ch_a", 1, 1)], has_more: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = StripeAdapter.fromConfig(session);
    const result = await adapter.query({
      resource: "charges",
      columns: ["id", "amount"],
      orderBy: [{ column: "amount", direction: "asc" }],
      limit: 1,
    });
    expect(result.rows).toEqual([{ id: "ch_a", amount: 1 }]);
    expect(result.columns.map((column) => column.name)).toEqual(["id", "amount"]);
    await adapter.close();
  });

  it("returns columns in the requested order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ object: "list", data: [customer("cus_ada")], has_more: false })),
    );
    const adapter = StripeAdapter.fromConfig(session);
    const result = await adapter.query({
      resource: "customers",
      columns: ["email", "id"],
      limit: 1,
    });
    expect(result.columns.map((column) => column.name)).toEqual(["email", "id"]);
    expect(Object.keys(result.rows[0] ?? {})).toEqual(["email", "id"]);
    await adapter.close();
  });

  it("throws when a page repeats its cursor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ object: "list", data: [charge("ch_b", 1, 1)], has_more: true })),
    );
    const adapter = StripeAdapter.fromConfig(session);
    await expect(
      adapter.query({ resource: "charges", orderBy: [{ column: "amount", direction: "asc" }] }),
    ).rejects.toThrow(/repeated a page/i);
    await adapter.close();
  });

  it("throws when an empty page still reports more rows", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ object: "list", data: [], has_more: true })));
    const adapter = StripeAdapter.fromConfig(session);
    await expect(adapter.query({ resource: "charges", limit: 1 })).rejects.toThrow(/unexpected/i);
    await adapter.close();
  });

  it("throws instead of returning a partial ordered page at the scan cap", async () => {
    let page = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      const data = Array.from({ length: 100 }, (_, index) => charge(`ch_${page}_${index}`, index, page));
      page += 1;
      return json({ object: "list", data, has_more: true });
    }));
    const adapter = StripeAdapter.fromConfig(session);
    await expect(
      adapter.query({ resource: "charges", orderBy: [{ column: "id", direction: "asc" }], limit: 1 }),
    ).rejects.toThrow(/10000 rows/i);
    await adapter.close();
  });

  it("accepts a restricted key that can list one resource", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
      const href = String(url);
      if (href.includes("/v1/customers")) {
        return json({ error: { message: "permission" } }, 403);
      }
      return json({ object: "list", data: [], has_more: false });
    }));
    const adapter = StripeAdapter.fromConfig(session);
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    await adapter.close();
  });

  it("does not call a permission failure a rejected key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "permission" } }, 403)));
    const adapter = StripeAdapter.fromConfig(session);
    const result = await adapter.testConnection();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/cannot list/i);
    expect(result.message).not.toMatch(/rejected the api key/i);
    await adapter.close();
  });

  it("omits resources the key cannot read", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
      if (String(url).includes("/v1/invoices")) {
        return json({}, 403);
      }
      return json({ object: "list", data: [], has_more: false });
    }));
    const adapter = StripeAdapter.fromConfig(session);
    const schema = await adapter.introspectSchema();
    expect(schema.resources.map((resource) => resource.name)).toEqual([
      "customers",
      "charges",
      "subscriptions",
    ]);
    await adapter.close();
  });
});
