import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Collection } from "mongodb";
import {
  EmailTakenError,
  authenticatePassword,
  countUsers,
  createSession,
  createUser,
  findUserById,
  findUserByEmail,
  grantInitialAdmin,
  issueApiToken,
  listTokens,
  resolveAuth,
  revokeApiToken,
} from "./auth.ts";
import { ensurePersonalWorkspace } from "./services/workspaces.ts";
import { hashSecret } from "./crypto.ts";
import { dashboards, organizationSettings, sessions } from "./db.ts";
import { SESSION_COOKIE } from "./http.ts";
import { ensureSeeded, resetSeedForTests } from "./seed.ts";
import { appendDashboardWidget, createDashboard, listDashboards, updateDashboard } from "./services/dashboards.ts";
import { getSettings, InvalidEmailDomainError, updateSettings } from "./services/settings.ts";
import { listDataSources } from "./services/data-sources.ts";
import { destroyAppDatabase, useFreshAppDatabase } from "./test-db.ts";

function sessionRequest(token: string): Request {
  return new Request("http://localhost/api/auth/me", {
    headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` },
  });
}

describe("app database", () => {
  beforeEach(async () => {
    await useFreshAppDatabase();
  });

  afterEach(async () => {
    await destroyAppDatabase();
  });

  it("stores a user, session, and api token", async () => {
    const user = await createUser({
      email: "ada@example.com",
      name: "Ada",
      password: "password123",
      role: "admin",
    });
    expect(await countUsers()).toBe(1);
    await expect(
      createUser({
        email: "ada@example.com",
        name: "Other",
        password: "password123",
        role: "member",
      }),
    ).rejects.toBeInstanceOf(EmailTakenError);

    const authenticated = await authenticatePassword("ada@example.com", "password123");
    expect(authenticated?.id).toBe(user.id);
    expect(await authenticatePassword("ada@example.com", "wrong-password")).toBeUndefined();

    const token = await createSession(user.id);
    const auth = await resolveAuth(sessionRequest(token));
    expect(auth?.user.email).toBe("ada@example.com");
    expect(auth?.via).toBe("session");

    await (
      await sessions()
    ).updateOne(
      { tokenHash: hashSecret(token) },
      { $set: { expiresAt: new Date(Date.now() - 1000).toISOString() } },
    );
    expect(await resolveAuth(sessionRequest(token))).toBeUndefined();
    expect(await (await sessions()).countDocuments({ tokenHash: hashSecret(token) })).toBe(0);

    const issued = await issueApiToken({
      userId: user.id,
      workspaceId: await ensurePersonalWorkspace(user.id),
      name: "mcp",
      scopes: ["read", "mcp"],
      expiresAt: null,
    });
    const bearer = new Request("http://localhost/api/auth/me", {
      headers: { authorization: `Bearer ${issued.token}` },
    });
    const tokenAuth = await resolveAuth(bearer);
    expect(tokenAuth?.via).toBe("token");
    expect(tokenAuth?.scopes).toEqual(["read", "mcp"]);
    const listed = await listTokens(user.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.lastUsedAt).toEqual(expect.any(String));
    expect(await revokeApiToken(user.id, issued.record.id)).toBe(true);
    expect(await resolveAuth(bearer)).toBeUndefined();
    expect(await listTokens(user.id)).toEqual([]);
  });

  it("round-trips organization settings and dashboards", async () => {
    expect(await getSettings()).toEqual({
      name: "Dash",
      allowRegistration: true,
      allowedEmailDomains: [],
    });
    await Promise.all([
      updateSettings({ name: "Acme" }),
      updateSettings({ allowRegistration: false }),
    ]);
    expect(await getSettings()).toEqual({
      name: "Acme",
      allowRegistration: false,
      allowedEmailDomains: [],
    });
    expect(
      await updateSettings({ allowedEmailDomains: ["@Acme.com", "acme.com"] }),
    ).toMatchObject({ allowedEmailDomains: ["acme.com"] });
    await expect(updateSettings({ allowedEmailDomains: ["not a domain"] })).rejects.toBeInstanceOf(
      InvalidEmailDomainError,
    );
    expect((await getSettings()).allowedEmailDomains).toEqual(["acme.com"]);
    await (await organizationSettings()).updateOne(
      { _id: "organization" },
      { $unset: { allowedEmailDomains: "" } },
    );
    expect(await getSettings()).toEqual({
      name: "Acme",
      allowRegistration: false,
      allowedEmailDomains: [],
    });

    const admin = await createUser({
      email: "admin@example.com",
      name: "Admin",
      password: "password123",
      role: "admin",
    });
    const workspaceId = await ensurePersonalWorkspace(admin.id);
    const first = await createDashboard({
      workspaceId,
      name: "First",
      description: "older",
      widgets: [],
      createdBy: admin.id,
    });
    const second = await createDashboard({
      workspaceId,
      name: "Second",
      description: "newer",
      widgets: [],
      createdBy: admin.id,
    });
    await (
      await dashboards()
    ).updateOne({ _id: first.id }, { $set: { updatedAt: "2000-01-01T00:00:00.000Z" } });
    expect((await listDashboards(workspaceId)).map((dashboard) => dashboard.id)).toEqual([
      second.id,
      first.id,
    ]);

    await Promise.all([
      appendDashboardWidget(workspaceId, second.id, {
        id: "w1",
        type: "table",
        title: "One",
        layout: { x: 0, y: 0, w: 6, h: 4 },
        dataSourceId: "demo",
        query: { resource: "product_sales" },
      }),
      appendDashboardWidget(workspaceId, second.id, {
        id: "w2",
        type: "table",
        title: "Two",
        layout: { x: 6, y: 0, w: 6, h: 4 },
        dataSourceId: "demo",
        query: { resource: "product_sales" },
      }),
    ]);
    const renamed = await updateDashboard(workspaceId, second.id, { name: "Renamed" });
    expect(renamed?.name).toBe("Renamed");
    expect(renamed?.widgets.map((widget) => widget.id).sort()).toEqual(["w1", "w2"]);
  });

  it("promotes only one of two concurrent first users", async () => {
    const [first, second] = await Promise.all([
      createUser({
        email: "one@example.com",
        name: "One",
        password: "password123",
        role: "member",
      }),
      createUser({
        email: "two@example.com",
        name: "Two",
        password: "password123",
        role: "member",
      }),
    ]);
    const [firstAdmin, secondAdmin] = await Promise.all([
      grantInitialAdmin(first.id),
      grantInitialAdmin(second.id),
    ]);
    expect([firstAdmin, secondAdmin].filter(Boolean)).toHaveLength(1);
    const winner = firstAdmin ? first.id : second.id;
    expect((await findUserById(winner))?.role).toBe("admin");
    const loser = firstAdmin ? second.id : first.id;
    expect((await findUserById(loser))?.role).toBe("member");
  });

  it("seeds the demo workspace once", async () => {
    process.env.DASH_SEED_DEMO = "true";
    resetSeedForTests();
    await Promise.all([ensureSeeded(), ensureSeeded()]);
    expect(await countUsers()).toBe(1);
    const admin = (await findUserByEmail("admin@dash.dev"))!;
    const workspaceId = await ensurePersonalWorkspace(admin._id);
    expect(await listDashboards(workspaceId)).toHaveLength(1);
    await ensureSeeded();
    expect(await countUsers()).toBe(1);
  });

  it.each(["workspace", "dashboard"])("resumes demo setup after a failed %s write", async (step) => {
    process.env.DASH_SEED_DEMO = "true";
    const updateOne = Collection.prototype.updateOne;
    const insertOne = Collection.prototype.insertOne;
    const update = vi
      .spyOn(Collection.prototype, "updateOne")
      .mockImplementation(function (this: Collection, ...args) {
        if (step === "workspace" && this.collectionName === "workspaces") {
          return Promise.reject(new Error("Seed write failed"));
        }
        return updateOne.apply(this, args);
      });
    const insert = vi
      .spyOn(Collection.prototype, "insertOne")
      .mockImplementation(function (this: Collection, ...args) {
        if (step === "dashboard" && this.collectionName === "dashboards") {
          return Promise.reject(new Error("Seed write failed"));
        }
        return insertOne.apply(this, args);
      });
    try {
      await expect(ensureSeeded()).rejects.toThrow("Seed write failed");
    } finally {
      update.mockRestore();
      insert.mockRestore();
    }
    expect(await countUsers()).toBe(1);
    resetSeedForTests();
    await Promise.all([ensureSeeded(), ensureSeeded()]);
    const admin = (await findUserByEmail("admin@dash.dev"))!;
    const workspaceId = await ensurePersonalWorkspace(admin._id);
    const sources = await listDataSources();
    const pages = await listDashboards(workspaceId);
    expect(sources).toHaveLength(1);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.widgets.every((widget) => widget.dataSourceId === sources[0]?.id)).toBe(true);
    expect(admin.role).toBe("admin");
    resetSeedForTests();
    await ensureSeeded();
    expect(await countUsers()).toBe(1);
    expect(await listDataSources()).toHaveLength(1);
    expect(await listDashboards(workspaceId)).toHaveLength(1);
  });
});
