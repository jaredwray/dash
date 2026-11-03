import { afterEach, describe, expect, it } from "vitest";
import { checkDatabase, closeDb, getDb } from "./db.ts";
import { healthResponse, pingResponse } from "./health.ts";
import { destroyAppDatabase, useFreshAppDatabase } from "./test-db.ts";

describe("database health checks", () => {
  afterEach(async () => {
    await destroyAppDatabase();
  });

  it("reports a connected database from healthz and ping", async () => {
    await useFreshAppDatabase();

    expect(await checkDatabase()).toEqual({ ok: true });

    const health = await healthResponse();
    const ping = await pingResponse();

    expect(health.status).toBe(200);
    expect(ping.status).toBe(200);
    await expect(health.json()).resolves.toEqual({
      status: "ok",
      database: "connected",
    });
    await expect(ping.json()).resolves.toEqual({
      pong: true,
      database: "connected",
    });
  });

  it("returns 503 when the database URI is invalid", async () => {
    await closeDb();
    process.env.DASH_SECRET = "unit-test-secret";
    process.env.MONGODB_URI = "not-a-mongodb-uri";

    const health = await healthResponse();
    const ping = await pingResponse();

    expect(health.status).toBe(503);
    expect(ping.status).toBe(503);
    await expect(health.json()).resolves.toEqual({
      status: "error",
      database: "disconnected",
    });
    await expect(ping.json()).resolves.toEqual({
      pong: false,
      database: "disconnected",
    });
    expect((await checkDatabase()).ok).toBe(false);
  });

  it("returns 503 when MongoDB does not accept connections", async () => {
    await closeDb();
    process.env.DASH_SECRET = "unit-test-secret";
    process.env.MONGODB_URI =
      "mongodb://127.0.0.1:1/dash_unreachable?authSource=admin";

    const [health, ping] = await Promise.all([healthResponse(), pingResponse()]);

    expect(health.status).toBe(503);
    expect(ping.status).toBe(503);
    await expect(health.json()).resolves.toEqual({
      status: "error",
      database: "disconnected",
    });
    await expect(ping.json()).resolves.toEqual({
      pong: false,
      database: "disconnected",
    });
  }, 15_000);

  it("returns 503 when the ping result is not ok", async () => {
    await useFreshAppDatabase();
    const db = await getDb();
    await db.dropDatabase();
    db.command = (async () => ({ ok: 0 })) as typeof db.command;

    const ping = await pingResponse();
    expect(ping.status).toBe(503);
    await expect(ping.json()).resolves.toEqual({
      pong: false,
      database: "disconnected",
    });
  });

  it("returns 503 when the probe throws a non-error", async () => {
    await useFreshAppDatabase();
    const db = await getDb();
    await db.dropDatabase();
    db.command = (async () => {
      throw "database unavailable";
    }) as typeof db.command;

    const health = await healthResponse();
    expect(health.status).toBe(503);
    await expect(health.json()).resolves.toEqual({
      status: "error",
      database: "disconnected",
    });
  });
});
