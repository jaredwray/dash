import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PublicUser } from "@dash/core";
import { createSession, createUser, issueApiToken } from "./auth.ts";
import { closeAdapters } from "./adapters/registry.ts";
import { workspaces } from "./db.ts";
import { destroyAppDatabase, useFreshAppDatabase } from "./test-db.ts";
import { listDashboards } from "./services/dashboards.ts";
import { createDataSource } from "./services/data-sources.ts";
import { DEV_SEED_WORKSPACE, getDevSeedState, type DevSeedState } from "./services/dev-seed.ts";
import { queryDataSource } from "./services/query.ts";
import { ensurePersonalWorkspace } from "./services/workspaces.ts";
import { Route as DevSeed } from "../routes/api/dev-seed.ts";

type Handler = (input: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function call(method: string, auth: { session?: string; token?: string }, options: { body?: unknown; query?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (auth.token) headers.set("authorization", `Bearer ${auth.token}`);
  else if (auth.session) headers.set("cookie", `dash_session=${auth.session}`);
  const request = new Request(`http://localhost/api/dev-seed${options.query ?? ""}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const handlers = (DevSeed.options.server as { handlers: Record<string, Handler> }).handlers;
  return handlers[method]!({ request, params: {} });
}

/** Polls the run state the same way the Settings page does. */
async function settled(): Promise<DevSeedState> {
  const deadline = Date.now() + 90_000;
  for (;;) {
    const state = await getDevSeedState();
    if (state.status !== "running") return state;
    if (Date.now() > deadline) throw new Error("The seed run did not finish");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

const pgEndpoint = {
  host: process.env.DASH_TEST_POSTGRES_HOST ?? "127.0.0.1",
  port: Number(process.env.DASH_TEST_POSTGRES_PORT ?? 54329),
  user: process.env.DASH_TEST_POSTGRES_USER ?? "dash",
  password: process.env.DASH_TEST_POSTGRES_PASSWORD ?? "dash",
};
const mongoEndpoint = {
  host: process.env.DASH_TEST_MONGODB_HOST ?? "127.0.0.1",
  port: Number(process.env.DASH_TEST_MONGODB_PORT ?? 27029),
  user: process.env.DASH_TEST_MONGODB_USER ?? "dash",
  password: process.env.DASH_TEST_MONGODB_PASSWORD ?? "dash",
  authSource: process.env.DASH_TEST_MONGODB_AUTH_SOURCE ?? "admin",
};
// Fresh warehouse databases: the adapter tests list every schema in `dash`.
const warehouse = `dash_seed_web_${randomBytes(4).toString("hex")}`;
const pgAdmin = new pg.Client({ ...pgEndpoint, database: process.env.DASH_TEST_POSTGRES_DATABASE ?? "dash" });
const mongo = new MongoClient(
  `mongodb://${encodeURIComponent(mongoEndpoint.user)}:${encodeURIComponent(mongoEndpoint.password)}@${mongoEndpoint.host}:${mongoEndpoint.port}/?authSource=${mongoEndpoint.authSource}`,
);

describe("development seeding", () => {
  const previous = { flag: process.env.DASH_SEED_DEV_SOURCES, nodeEnv: process.env.NODE_ENV };
  let admin: PublicUser;
  let session: string;

  beforeAll(async () => {
    await pgAdmin.connect();
    await pgAdmin.query(`CREATE DATABASE ${warehouse}`);
    await mongo.connect();
  });

  afterAll(async () => {
    await pgAdmin.query(`DROP DATABASE IF EXISTS ${warehouse} WITH (FORCE)`);
    await pgAdmin.end();
    await mongo.db(warehouse).dropDatabase();
    await mongo.close();
  });

  beforeEach(async () => {
    await useFreshAppDatabase();
    process.env.DASH_SEED_DEV_SOURCES = "true";
    delete process.env.NODE_ENV;
    admin = await createUser({ email: "admin@example.com", name: "Admin", password: "password123", role: "admin" });
    session = await createSession(admin.id);
  });

  afterEach(async () => {
    await settled().catch(() => undefined);
    await closeAdapters();
    await destroyAppDatabase();
    if (previous.flag === undefined) delete process.env.DASH_SEED_DEV_SOURCES;
    else process.env.DASH_SEED_DEV_SOURCES = previous.flag;
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
  });

  it("answers 404 unless the flag is on outside production, and refuses API tokens", async () => {
    delete process.env.DASH_SEED_DEV_SOURCES;
    for (const method of ["GET", "POST", "DELETE"]) {
      expect((await call(method, { session }, { body: {} })).status).toBe(404);
    }
    process.env.DASH_SEED_DEV_SOURCES = "true";
    process.env.NODE_ENV = "production";
    expect((await call("GET", { session })).status).toBe(404);
    delete process.env.NODE_ENV;

    const workspaceId = await ensurePersonalWorkspace(admin.id);
    const { token } = await issueApiToken({ userId: admin.id, workspaceId, name: "ci", scopes: ["read", "write"], expiresAt: null });
    expect((await call("GET", { token })).status).toBe(403);
    expect((await call("GET", { session })).status).toBe(200);
  });

  it("seeds Postgres and MongoDB sources, and every seeded widget returns rows", async () => {
    const postgres = await createDataSource({
      name: "Product Postgres",
      description: "",
      config: { kind: "postgres", ...pgEndpoint, database: warehouse },
      createdBy: admin.id,
    });
    const support = await createDataSource({
      name: "Support MongoDB",
      description: "",
      config: { kind: "mongodb", ...mongoEndpoint, database: warehouse },
      createdBy: admin.id,
    });
    const appDatabase = await createDataSource({
      name: "App database",
      description: "",
      config: { kind: "mongodb", connectionString: process.env.MONGODB_URI! },
      createdBy: admin.id,
    });

    const planned = await (await call("GET", { session }, { query: "?size=small" })).json();
    const statuses = Object.fromEntries(planned.plan.sources.map((item: { id: string; status: string }) => [item.id, item.status]));
    expect(statuses).toEqual({ [postgres.id]: "target", [support.id]: "target", [appDatabase.id]: "refused" });

    expect((await call("POST", { session }, { body: { planId: "stale", size: "small" } })).status).toBe(409);
    const started = await call("POST", { session }, { body: { planId: planned.plan.planId, size: "small" } });
    expect(started.status).toBe(202);
    const busy = await call("POST", { session }, { body: { planId: planned.plan.planId, size: "small" } });
    expect(busy.status).toBe(409);

    const state = await settled();
    expect(state.error).toBeNull();
    expect(state.status).toBe("succeeded");
    expect(state.steps.every((step) => step.status === "done" && step.rows > 0)).toBe(true);
    const workspace = await (await workspaces()).findOne({ _id: state.workspaceId! });
    expect(workspace?.name).toBe(DEV_SEED_WORKSPACE);
    const pages = await listDashboards(state.workspaceId!);
    expect(pages.map((page) => page.name).sort()).toEqual(
      ["Customer support", "Executive overview", "Marketing performance", "Product engagement", "Revenue & billing", "Sales pipeline"],
    );
    for (const page of pages) {
      for (const widget of page.widgets) {
        expect([postgres.id, support.id], `${page.name}/${widget.title}`).toContain(widget.dataSourceId);
        const result = await queryDataSource(widget.dataSourceId, widget.query);
        expect(result.rows.length, `${page.name}/${widget.title}`).toBeGreaterThan(0);
      }
    }

    // A second run replaces the data and the dashboards.
    const again = await call("POST", { session }, { body: { planId: planned.plan.planId, size: "small" } });
    expect(again.status).toBe(202);
    const second = await settled();
    expect(second.status).toBe("succeeded");
    expect(second.workspaceId).toBe(state.workspaceId);
    expect(await listDashboards(state.workspaceId!)).toHaveLength(6);

    // Removal drops the seeded data and dashboards.
    expect((await call("DELETE", { session })).status).toBe(202);
    const removed = await settled();
    expect(removed.status).toBe("succeeded");
    expect(removed.hasSeedData).toBe(false);
    expect(await listDashboards(state.workspaceId!)).toEqual([]);
    const schemas = new pg.Client({ ...pgEndpoint, database: warehouse });
    await schemas.connect();
    try {
      const rows = await schemas.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'fernway_%'");
      expect(rows.rows).toEqual([]);
    } finally {
      await schemas.end();
    }
    expect(await mongo.db(warehouse).listCollections().toArray()).toEqual([]);
  });
});
