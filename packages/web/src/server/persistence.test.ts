import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EmailTakenError,
  authenticatePassword,
  countUsers,
  createSession,
  createUser,
  findUserById,
  grantInitialAdmin,
  issueApiToken,
  listTokens,
  resolveAuth,
  revokeApiToken,
} from "./auth.ts";
import { hashSecret } from "./crypto.ts";
import { dashboards, sessions } from "./db.ts";
import { SESSION_COOKIE } from "./http.ts";
import { ensureSeeded, resetSeedForTests } from "./seed.ts";
import { appendDashboardWidget, createDashboard, listDashboards, updateDashboard } from "./services/dashboards.ts";
import { getSettings, updateSettings } from "./services/settings.ts";
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
    expect(await getSettings()).toEqual({ name: "Dash", allowRegistration: true });
    await Promise.all([
      updateSettings({ name: "Acme" }),
      updateSettings({ allowRegistration: false }),
    ]);
    expect(await getSettings()).toEqual({ name: "Acme", allowRegistration: false });

    const admin = await createUser({
      email: "admin@example.com",
      name: "Admin",
      password: "password123",
      role: "admin",
    });
    const first = await createDashboard({
      name: "First",
      description: "older",
      widgets: [],
      createdBy: admin.id,
    });
    const second = await createDashboard({
      name: "Second",
      description: "newer",
      widgets: [],
      createdBy: admin.id,
    });
    await (
      await dashboards()
    ).updateOne({ _id: first.id }, { $set: { updatedAt: "2000-01-01T00:00:00.000Z" } });
    expect((await listDashboards()).map((dashboard) => dashboard.id)).toEqual([
      second.id,
      first.id,
    ]);

    await Promise.all([
      appendDashboardWidget(second.id, {
        id: "w1",
        type: "table",
        title: "One",
        layout: { x: 0, y: 0, w: 6, h: 4 },
        dataSourceId: "demo",
        query: { resource: "product_sales" },
      }),
      appendDashboardWidget(second.id, {
        id: "w2",
        type: "table",
        title: "Two",
        layout: { x: 6, y: 0, w: 6, h: 4 },
        dataSourceId: "demo",
        query: { resource: "product_sales" },
      }),
    ]);
    const renamed = await updateDashboard(second.id, { name: "Renamed" });
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
    expect(await listDashboards()).toHaveLength(1);
    await ensureSeeded();
    expect(await countUsers()).toBe(1);
  });
});
