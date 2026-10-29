import { describe, expect, it } from "vitest";
import { parseStripeConnectionString, stripePublicSummary, stripeSession } from "./connection.ts";

const KEY = "sk_test_dash";

describe("parseStripeConnectionString", () => {
  it("reads a secret key and a loopback fixture host", () => {
    expect(parseStripeConnectionString(`stripe://${KEY}@127.0.0.1:12119`)).toEqual({
      apiKey: KEY,
      origin: "http://127.0.0.1:12119",
    });
  });

  it("defaults a loopback host without a port to the fixture port", () => {
    expect(parseStripeConnectionString(`stripe://${KEY}@localhost`).origin).toBe(
      "http://localhost:12119",
    );
  });

  it("uses HTTPS for the Stripe API host", () => {
    expect(parseStripeConnectionString(`stripe://${KEY}@api.stripe.com`).origin).toBe(
      "https://api.stripe.com",
    );
  });

  it("decodes a percent-encoded key", () => {
    expect(parseStripeConnectionString("stripe://sk_test_abc%31@api.stripe.com").apiKey).toBe(
      "sk_test_abc1",
    );
  });

  it("rejects another scheme without echoing the key", () => {
    expect(() => parseStripeConnectionString(`https://api.stripe.com`)).toThrow(/stripe:\/\//);
  });

  it("rejects an unsupported parameter without echoing the key or the parameter", () => {
    expect(() => parseStripeConnectionString(`stripe://${KEY}@api.stripe.com?debug=1`)).toThrow(
      /unsupported stripe connection parameter/i,
    );
    try {
      parseStripeConnectionString(`stripe://${KEY}@api.stripe.com?debug=1`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).not.toContain(KEY);
      expect(message).not.toMatch(/debug/i);
    }
  });

  it("rejects a non-loopback host without echoing it", () => {
    expect(() => parseStripeConnectionString(`stripe://${KEY}@evil.example`)).toThrow(
      /invalid stripe api host/i,
    );
    try {
      parseStripeConnectionString(`stripe://${KEY}@evil.example`);
    } catch (error) {
      expect(error instanceof Error ? error.message : "").not.toContain("evil.example");
      expect(error instanceof Error ? error.message : "").not.toContain(KEY);
    }
  });

  it("rejects a broken escape without echoing the value", () => {
    expect(() => parseStripeConnectionString("stripe://sk_test_100%@api.stripe.com")).toThrow(
      /invalid stripe api key/i,
    );
  });
});

describe("stripeSession", () => {
  it("lets an explicit key and endpoint override the URI", () => {
    const session = stripeSession({
      kind: "stripe",
      connectionString: `stripe://${KEY}@api.stripe.com`,
      apiKey: "sk_live_override",
      apiEndpoint: "http://127.0.0.1:12119",
    });
    expect(session.apiKey).toBe("sk_live_override");
    expect(session.origin).toBe("http://127.0.0.1:12119");
    expect(session.mode).toBe("live");
  });

  it("refuses HTTP except on loopback", () => {
    expect(() =>
      stripeSession({
        kind: "stripe",
        apiKey: KEY,
        apiEndpoint: "http://api.stripe.com",
      }),
    ).toThrow(/invalid stripe api endpoint/i);
  });

  it("refuses to send the key to another HTTPS host", () => {
    expect(() =>
      stripeSession({
        kind: "stripe",
        apiKey: KEY,
        apiEndpoint: "https://evil.example",
      }),
    ).toThrow(/invalid stripe api endpoint/i);
  });
});

describe("stripePublicSummary", () => {
  it("reports the endpoint and mode without the key", () => {
    const summary = stripePublicSummary({
      kind: "stripe",
      connectionString: `stripe://${KEY}@127.0.0.1:12119`,
    });
    expect(summary).toEqual({ endpoint: "127.0.0.1:12119", mode: "test", restricted: false });
    expect(JSON.stringify(summary)).not.toContain(KEY);
  });

  it("stays empty when the URI cannot be parsed", () => {
    const summary = stripePublicSummary({
      kind: "stripe",
      connectionString: `stripe://${KEY}@evil.example?debug=1`,
    });
    expect(summary).toEqual({ endpoint: "", mode: "", restricted: false });
    expect(JSON.stringify(summary)).not.toContain(KEY);
  });

  it("labels a restricted key as test or live without revealing it", () => {
    expect(
      stripePublicSummary({
        kind: "stripe",
        apiKey: "rk_test_restricted",
      }),
    ).toEqual({ endpoint: "api.stripe.com", mode: "test", restricted: true });
    expect(
      stripePublicSummary({
        kind: "stripe",
        apiKey: "rk_live_restricted",
      }),
    ).toEqual({ endpoint: "api.stripe.com", mode: "live", restricted: true });
    expect(JSON.stringify(stripePublicSummary({ kind: "stripe", apiKey: "rk_live_restricted" }))).not.toContain(
      "rk_live_restricted",
    );
  });
});
