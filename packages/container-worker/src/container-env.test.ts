import { describe, expect, it } from "vitest";
import {
  CONTAINER_PORT,
  containerBlockedReason,
  containerEnv,
  forwardToContainer,
  mongoUriConfigured,
  secretConfigured,
} from "./container-env.ts";

describe("containerEnv", () => {
  it("points the server at the container port and forwards the MongoDB URI", () => {
    const env = containerEnv({
      DASH_SECRET: "a-real-secret",
      MONGODB_URI: " mongodb://user:pass@db.example.net/dash ",
    });
    expect(env.PORT).toBe(String(CONTAINER_PORT));
    expect(env.NITRO_PORT).toBe(String(CONTAINER_PORT));
    expect(env.HOST).toBe("0.0.0.0");
    expect(env.NITRO_HOST).toBe("0.0.0.0");
    expect(env.NODE_ENV).toBe("production");
    expect(env.DASH_DATABASE_PATH).toBeUndefined();
    expect(env.MONGODB_URI).toBe("mongodb://user:pass@db.example.net/dash");
    expect(env.DASH_SECRET).toBe("a-real-secret");
    expect(env.DASH_SEED_DEMO).toBe("false");
  });

  it("enables the demo seed only when the Worker var is true", () => {
    expect(containerEnv({ DASH_SECRET: "secret", DASH_SEED_DEMO: "true" }).DASH_SEED_DEMO).toBe(
      "true",
    );
    expect(containerEnv({ DASH_SECRET: "secret", DASH_SEED_DEMO: " TRUE " }).DASH_SEED_DEMO).toBe(
      "true",
    );
    expect(containerEnv({ DASH_SECRET: "secret", DASH_SEED_DEMO: "false" }).DASH_SEED_DEMO).toBe(
      "false",
    );
    expect(containerEnv({ DASH_SECRET: "secret", DASH_SEED_DEMO: "1" }).DASH_SEED_DEMO).toBe(
      "false",
    );
  });
});

describe("forwardToContainer", () => {
  it("overwrites a client-supplied container port", () => {
    const request = new Request("https://dev.dash.io/api/auth/me", {
      headers: { "cf-container-target-port": "22" },
    });
    const forwarded = forwardToContainer(request);
    expect(forwarded.headers.get("cf-container-target-port")).toBe(String(CONTAINER_PORT));
    expect(new URL(forwarded.url).pathname).toBe("/api/auth/me");
  });
});

describe("mongoUriConfigured", () => {
  it("accepts only a mongodb connection string", () => {
    expect(mongoUriConfigured(undefined)).toBe(false);
    expect(mongoUriConfigured("")).toBe(false);
    expect(mongoUriConfigured("  ")).toBe(false);
    expect(mongoUriConfigured("postgres://localhost/dash")).toBe(false);
    expect(mongoUriConfigured("mongodb://127.0.0.1:27017/dash")).toBe(true);
    expect(mongoUriConfigured("mongodb+srv://user:pass@cluster.example.net/dash")).toBe(true);
  });
});

describe("containerBlockedReason", () => {
  const uri = "mongodb://127.0.0.1:27017/dash";

  it("names the missing Worker secret", () => {
    expect(containerBlockedReason({})).toBe("DASH_SECRET is not configured");
    expect(containerBlockedReason({ DASH_SECRET: "a-real-secret" })).toBe(
      "MONGODB_URI is not configured",
    );
    expect(containerBlockedReason({ DASH_SECRET: "a-real-secret", MONGODB_URI: uri })).toBe(
      undefined,
    );
  });
});

describe("secretConfigured", () => {
  it("rejects an empty or placeholder production secret", () => {
    expect(secretConfigured(undefined)).toBe(false);
    expect(secretConfigured("")).toBe(false);
    expect(secretConfigured("  ")).toBe(false);
    expect(secretConfigured("change-me-in-production")).toBe(false);
    expect(secretConfigured("  change-me-in-production  ")).toBe(false);
    expect(secretConfigured("a-real-secret")).toBe(true);
  });
});
