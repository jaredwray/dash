import { afterEach, describe, expect, it, vi } from "vitest";
import { stripeGet, stripeList } from "./http.ts";
import type { StripeSession } from "./connection.ts";

const session: StripeSession = {
  apiKey: "sk_test_dash",
  origin: "http://127.0.0.1:12119",
  mode: "test",
  restricted: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stripeGet", () => {
  it("sends the key as a bearer token and does not follow redirects", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { Location: "https://evil.example" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(stripeGet(session, "/v1/balance", new URLSearchParams(), AbortSignal.timeout(1000))).rejects.toThrow(
      /redirect/i,
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://127.0.0.1:12119/v1/balance");
    expect(init.redirect).toBe("manual");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_dash");
  });

  it("reports an authentication failure without the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid API Key: sk_test_dash" } }), { status: 401 })),
    );
    await expect(stripeGet(session, "/v1/balance", new URLSearchParams(), AbortSignal.timeout(1000))).rejects.toThrow(
      /rejected the api key/i,
    );
  });

  it("reads a list page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ object: "list", data: [{ id: "cus_ada" }], has_more: false }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const page = await stripeList(session, "/v1/customers", new URLSearchParams("limit=1"), AbortSignal.timeout(1000));
    expect(page.data).toEqual([{ id: "cus_ada" }]);
    expect(page.hasMore).toBe(false);
  });

  it("rejects a list that omits has_more", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ object: "list", data: [] }), { status: 200 })),
    );
    await expect(stripeList(session, "/v1/customers", new URLSearchParams(), AbortSignal.timeout(1000))).rejects.toThrow(
      /unexpected/i,
    );
  });

  it("reports the query deadline as a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("The operation was aborted");
    }));
    await expect(
      stripeGet(session, "/v1/balance", new URLSearchParams(), new AbortController().signal, AbortSignal.abort()),
    ).rejects.toThrow(/timed out/i);
  });

  it("reports a closed client as a cancel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("The operation was aborted");
    }));
    await expect(
      stripeGet(session, "/v1/balance", new URLSearchParams(), AbortSignal.abort(), AbortSignal.timeout(60_000)),
    ).rejects.toThrow(/cancelled/i);
  });
});
