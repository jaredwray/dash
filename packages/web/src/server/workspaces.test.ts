import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PublicUser } from "@dash/core";
import { createSession, createUser, issueApiToken } from "./auth.ts";
import { workspaces } from "./db.ts";
import { destroyAppDatabase, useFreshAppDatabase } from "./test-db.ts";
import { ensurePersonalWorkspace, listWorkspaces } from "./services/workspaces.ts";
import { Route as WorkspaceIndex } from "../routes/api/workspaces.index.ts";
import { Route as WorkspaceItem } from "../routes/api/workspaces.$id.ts";
import { Route as WorkspaceMembers } from "../routes/api/workspaces.$id.members.ts";
import { Route as DashboardIndex } from "../routes/api/dashboards.index.ts";
import { Route as DashboardItem } from "../routes/api/dashboards.$id.ts";
import { Route as DataSources } from "../routes/api/data-sources.index.ts";
import { Route as Tokens } from "../routes/api/tokens.index.ts";

type Handler = (input: { request: Request; params: { id: string } }) => Promise<Response>;
type RouteHandlers = { options: { server?: { handlers?: unknown } } };

async function call(
  route: RouteHandlers,
  method: string,
  session: string,
  options: {
    id?: string;
    workspaceId?: string;
    body?: unknown;
    token?: string;
  } = {},
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  else if (session) headers.set("cookie", `dash_session=${session}`);
  if (options.workspaceId) headers.set("x-dash-workspace-id", options.workspaceId);
  const request = new Request("http://localhost/api", {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const handlers = route.options.server!.handlers as Record<string, Handler>;
  return handlers[method]!({ request, params: { id: options.id ?? "" } });
}

describe("organization workspaces", () => {
  let admin: PublicUser;
  let member: PublicUser;
  let adminSession: string;
  let memberSession: string;
  beforeEach(async () => {
    await useFreshAppDatabase();
    admin = await createUser({
      email: "admin@example.com",
      name: "Admin",
      password: "password123",
      role: "admin",
    });
    member = await createUser({
      email: "member@example.com",
      name: "Member",
      password: "password123",
      role: "member",
    });
    adminSession = await createSession(admin.id);
    memberSession = await createSession(member.id);
  });
  afterEach(destroyAppDatabase);

  async function shared() {
    const response = await call(WorkspaceIndex, "POST", adminSession, { body: { name: "Team" } });
    expect(response.status).toBe(201);
    return (await response.json()).workspace.id as string;
  }

  it("creates exactly one private personal workspace per account", async () => {
    expect(await (await workspaces()).countDocuments({ kind: "personal" })).toBe(2);
    const ids = await Promise.all(
      Array.from({ length: 8 }, () => ensurePersonalWorkspace(member.id)),
    );
    expect(new Set(ids).size).toBe(1);
    expect(await (await workspaces()).countDocuments({ ownerId: member.id })).toBe(1);
    const visible = await listWorkspaces(admin);
    expect(visible.map((workspace) => workspace.ownerId)).toEqual([admin.id]);
    expect((await call(WorkspaceIndex, "GET", "")).status).toBe(401);
    expect((await call(WorkspaceMembers, "GET", adminSession, { id: ids[0] })).status).toBe(404);
    const response = await call(DashboardIndex, "POST", memberSession, {
      body: { name: "My dashboard" },
    });
    expect(response.status).toBe(201);
    expect((await response.json()).dashboard.workspaceId).toBe(ids[0]);
  });

  it("limits shared workspace creation and access changes to organization admins", async () => {
    expect(
      (await call(WorkspaceIndex, "POST", memberSession, { body: { name: "No" } })).status,
    ).toBe(403);
    expect((await call(WorkspaceIndex, "POST", adminSession, { body: { name: " " } })).status).toBe(
      400,
    );
    const id = await shared();
    expect((await listWorkspaces(member)).map((workspace) => workspace.id)).not.toContain(id);
    expect(
      (
        await call(WorkspaceMembers, "PUT", adminSession, {
          id,
          body: { userId: member.id, role: "editor" },
        })
      ).status,
    ).toBe(200);
    expect((await listWorkspaces(member)).find((workspace) => workspace.id === id)?.role).toBe(
      "editor",
    );
    expect(
      (
        await call(WorkspaceMembers, "PUT", memberSession, {
          id,
          body: { userId: member.id, role: null },
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(WorkspaceItem, "PATCH", memberSession, { id, body: { name: "No" } })).status,
    ).toBe(403);
    expect(
      (await call(WorkspaceItem, "PATCH", adminSession, { id, body: { name: "Renamed" } })).status,
    ).toBe(200);
    expect((await listWorkspaces(member)).find((workspace) => workspace.id === id)?.name).toBe(
      "Renamed",
    );
    expect(
      (
        await call(WorkspaceMembers, "PUT", adminSession, {
          id,
          body: { userId: admin.id, role: null },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(WorkspaceMembers, "PUT", adminSession, {
          id,
          body: { userId: "outside-organization", role: "viewer" },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(WorkspaceMembers, "PUT", adminSession, {
          id,
          body: { userId: member.id, role: "owner" },
        })
      ).status,
    ).toBe(400);
    const other = await createUser({
      email: "other@example.com",
      name: "Other admin",
      password: "password123",
      role: "admin",
    });
    const otherSession = await createSession(other.id);
    expect(
      (
        await call(WorkspaceMembers, "PUT", otherSession, {
          id,
          body: { userId: member.id, role: null },
        })
      ).status,
    ).toBe(200);
    expect((await listWorkspaces(member)).map((workspace) => workspace.id)).not.toContain(id);
  });

  it("lets personal owners share, change access, and remove access", async () => {
    const id = await ensurePersonalWorkspace(member.id);
    await Promise.all(
      Array.from({ length: 4 }, () =>
        call(WorkspaceMembers, "PUT", memberSession, {
          id,
          body: { userId: admin.id, role: "viewer" },
        }),
      ),
    );
    const response = await call(WorkspaceMembers, "GET", memberSession, { id });
    const people = (await response.json()).members;
    expect(people).toHaveLength(2);
    expect(people.find((person: { id: string }) => person.id === admin.id).role).toBe("viewer");
    expect(
      (await call(DashboardIndex, "POST", adminSession, { workspaceId: id, body: { name: "No" } }))
        .status,
    ).toBe(403);
    expect((await call(WorkspaceMembers, "GET", adminSession, { id })).status).toBe(403);
    expect(
      (
        await call(WorkspaceMembers, "PUT", memberSession, {
          id,
          body: { userId: member.id, role: null },
        })
      ).status,
    ).toBe(400);
    await call(WorkspaceMembers, "PUT", memberSession, {
      id,
      body: { userId: admin.id, role: "editor" },
    });
    expect(
      (
        await call(DashboardIndex, "POST", adminSession, {
          workspaceId: id,
          body: { name: "Allowed" },
        })
      ).status,
    ).toBe(201);
    await call(WorkspaceMembers, "PUT", memberSession, {
      id,
      body: { userId: admin.id, role: null },
    });
    expect((await call(DashboardIndex, "GET", adminSession, { workspaceId: id })).status).toBe(404);
  });

  it("isolates all dashboard operations and preserves organization data sources", async () => {
    const id = await shared();
    const personal = await ensurePersonalWorkspace(admin.id);
    const response = await call(DashboardIndex, "POST", adminSession, {
      workspaceId: id,
      body: { name: "Team dashboard" },
    });
    const dashboard = (await response.json()).dashboard;
    expect(
      (
        await call(DashboardIndex, "GET", adminSession, { workspaceId: personal }).then((r) =>
          r.json(),
        )
      ).dashboards,
    ).toEqual([]);
    for (const method of ["GET", "PATCH", "DELETE"]) {
      const result = await call(DashboardItem, method, adminSession, {
        workspaceId: personal,
        id: dashboard.id,
        ...(method === "PATCH" ? { body: { name: "No" } } : {}),
      });
      expect(result.status).toBe(404);
    }
    await call(WorkspaceMembers, "PUT", adminSession, {
      id,
      body: { userId: member.id, role: "viewer" },
    });
    expect(
      (await call(DashboardItem, "GET", memberSession, { workspaceId: id, id: dashboard.id }))
        .status,
    ).toBe(200);
    for (const method of ["PATCH", "DELETE"]) {
      expect(
        (
          await call(DashboardItem, method, memberSession, {
            workspaceId: id,
            id: dashboard.id,
            ...(method === "PATCH" ? { body: { name: "No" } } : {}),
          })
        ).status,
      ).toBe(403);
    }
    expect(
      (
        await call(DataSources, "POST", adminSession, {
          body: { name: "Warehouse", config: { kind: "demo" } },
        })
      ).status,
    ).toBe(201);
    const sources = await call(DataSources, "GET", memberSession).then((r) => r.json());
    expect(sources.dataSources.map((source: { name: string }) => source.name)).toEqual([
      "Warehouse",
    ]);
    expect(
      (
        await call(DataSources, "POST", memberSession, {
          body: { name: "No", config: { kind: "demo" } },
        })
      ).status,
    ).toBe(403);
    await call(WorkspaceMembers, "PUT", adminSession, {
      id,
      body: { userId: member.id, role: "editor" },
    });
    expect(
      (
        await call(DashboardItem, "PATCH", memberSession, {
          workspaceId: id,
          id: dashboard.id,
          body: { name: "Edited" },
        })
      ).status,
    ).toBe(200);
    expect(
      (await call(DashboardItem, "DELETE", memberSession, { workspaceId: id, id: dashboard.id }))
        .status,
    ).toBe(200);
  });

  it("binds API tokens to one workspace and checks current access and scopes", async () => {
    const id = await shared();
    await call(WorkspaceMembers, "PUT", adminSession, {
      id,
      body: { userId: member.id, role: "editor" },
    });
    const response = await call(Tokens, "POST", memberSession, {
      workspaceId: id,
      body: { name: "MCP", scopes: ["read", "write", "mcp"] },
    });
    expect(response.status).toBe(201);
    const { token, record } = await response.json();
    expect(record.workspaceId).toBe(id);
    expect(
      (await call(DashboardIndex, "POST", "", { token, body: { name: "API dashboard" } })).status,
    ).toBe(201);
    expect(
      (
        await call(DashboardIndex, "GET", "", {
          token,
          workspaceId: await ensurePersonalWorkspace(member.id),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(WorkspaceMembers, "PUT", "", {
          token,
          id,
          body: { userId: admin.id, role: "editor" },
        })
      ).status,
    ).toBe(403);
    const readOnly = await issueApiToken({
      userId: member.id,
      workspaceId: id,
      name: "Read",
      scopes: ["read"],
      expiresAt: null,
    });
    expect(
      (await call(DashboardIndex, "POST", "", { token: readOnly.token, body: { name: "No" } }))
        .status,
    ).toBe(403);
    await call(WorkspaceMembers, "PUT", adminSession, {
      id,
      body: { userId: member.id, role: "viewer" },
    });
    expect((await call(DashboardIndex, "POST", "", { token, body: { name: "No" } })).status).toBe(
      403,
    );
    await call(WorkspaceMembers, "PUT", adminSession, {
      id,
      body: { userId: member.id, role: null },
    });
    expect((await call(DashboardIndex, "GET", "", { token })).status).toBe(404);
  });
});
