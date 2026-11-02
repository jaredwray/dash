import { describe, expect, it } from "vitest";
import { CONTAINER_PORT, containerEnv, forwardToContainer, secretConfigured } from "./container-env.ts";

describe("containerEnv", () => {
  it("points the server at the container port and a writable database path", () => {
    const env = containerEnv({ DASH_SECRET: "a-real-secret" });
    expect(env.PORT).toBe(String(CONTAINER_PORT));
    expect(env.NITRO_PORT).toBe(String(CONTAINER_PORT));
    expect(env.HOST).toBe("0.0.0.0");
    expect(env.NITRO_HOST).toBe("0.0.0.0");
    expect(env.NODE_ENV).toBe("production");
    expect(env.DASH_DATABASE_PATH).toBe("/data/dash.sqlite");
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
