import { randomBytes } from "node:crypto";
import { Collection, MongoClient } from "mongodb";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@dash/core";
import { createSession, createUser, issueApiToken } from "./auth.ts";
import { closeAdapters } from "./adapters/registry.ts";
import { workspaces } from "./db.ts";
import { destroyAppDatabase, useFreshAppDatabase } from "./test-db.ts";
import { listDashboards } from "./services/dashboards.ts";
import { createDataSource, deleteDataSource, updateDataSource } from "./services/data-sources.ts";
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
    ...(options.body === undefined || method === "GET" ? {} : { body: JSON.stringify(options.body) }),
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

// Each seeding test writes every domain, then queries or removes it.
const SEED_TEST_TIMEOUT = 60_000;

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
  }, SEED_TEST_TIMEOUT);

  async function seedPostgresOnly() {
    const source = await createDataSource({
      name: "Warehouse",
      description: "",
      config: { kind: "postgres", ...pgEndpoint, database: warehouse },
      createdBy: admin.id,
    });
    const planned = await (await call("GET", { session }, { query: "?size=small" })).json();
    expect((await call("POST", { session }, { body: { planId: planned.plan.planId, size: "small" } })).status).toBe(202);
    return source;
  }

  async function fernwaySchemas(): Promise<string[]> {
    const client = new pg.Client({ ...pgEndpoint, database: warehouse });
    await client.connect();
    try {
      const rows = await client.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'fernway_%' ORDER BY 1");
      return rows.rows.map((row) => String(row.schema_name));
    } finally {
      await client.end();
    }
  }

  it("keeps the removal record until a source points at the seeded target again", async () => {
    const source = await seedPostgresOnly();
    expect((await settled()).status).toBe("succeeded");
    const seeded = await fernwaySchemas();
    expect(seeded).toHaveLength(7);

    await updateDataSource(source.id, { config: { kind: "postgres", ...pgEndpoint, database: `${warehouse}_moved` } });
    expect((await call("DELETE", { session })).status).toBe(202);
    const blocked = await settled();
    expect(blocked.status).toBe("failed");
    expect(blocked.steps.every((step) => step.status === "failed" && step.error?.includes("points somewhere else"))).toBe(true);
    expect(blocked.hasSeedData).toBe(true);
    expect(await fernwaySchemas()).toEqual(seeded);

    // Deleted, the source leaves no way to the data, so the record stays.
    await deleteDataSource(source.id);
    expect((await call("DELETE", { session })).status).toBe(202);
    const orphaned = await settled();
    expect(orphaned.status).toBe("failed");
    expect(orphaned.steps.every((step) => step.error?.includes("No data source points at"))).toBe(true);
    expect(orphaned.hasSeedData).toBe(true);

    // A new source with the original target can remove the data.
    await createDataSource({ name: "Warehouse again", description: "", config: { kind: "postgres", ...pgEndpoint, database: warehouse }, createdBy: admin.id });
    expect((await call("DELETE", { session })).status).toBe(202);
    const removed = await settled();
    expect(removed.status).toBe("succeeded");
    expect(removed.hasSeedData).toBe(false);
    expect(await fernwaySchemas()).toEqual([]);
  }, SEED_TEST_TIMEOUT);

  it("tracks the workspace and each dashboard when a dashboard write fails", async () => {
    const insertOne = Collection.prototype.insertOne;
    let dashboardsWritten = 0;
    const spy = vi.spyOn(Collection.prototype, "insertOne").mockImplementation(function (this: Collection, ...args) {
      if (this.collectionName === "dashboards" && ++dashboardsWritten === 2) {
        return Promise.reject(new Error("Dashboard write failed"));
      }
      return insertOne.apply(this, args);
    });
    let state: DevSeedState;
    try {
      await seedPostgresOnly();
      state = await settled();
    } finally {
      spy.mockRestore();
    }
    expect(state.status).toBe("failed");
    expect(state.error).toBe("Dashboard write failed");
    expect(state.workspaceId).not.toBeNull();
    expect(state.dashboards).toHaveLength(1);
    expect(await listDashboards(state.workspaceId!)).toHaveLength(1);

    expect((await call("DELETE", { session })).status).toBe(202);
    const removed = await settled();
    expect(removed.status).toBe("succeeded");
    expect(await listDashboards(state.workspaceId!)).toEqual([]);
    expect(await fernwaySchemas()).toEqual([]);
  }, SEED_TEST_TIMEOUT);
});
