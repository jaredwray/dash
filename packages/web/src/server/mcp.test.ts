import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth.ts";
import { createDashboard, getDashboard } from "./services/dashboards.ts";
import { createWorkspace, ensurePersonalWorkspace, setWorkspaceMember } from "./services/workspaces.ts";
import { mcpHandler } from "./mcp.ts";
import { destroyAppDatabase, useFreshAppDatabase } from "./test-db.ts";

function mcpRequest(body: string): Request {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body,
  });
}

describe("mcp handler", () => {
  beforeEach(async () => {
    await useFreshAppDatabase();
  });

  afterEach(async () => {
    await destroyAppDatabase();
  });

  it("rejects a body over 1 MiB", async () => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { pad: "x".repeat(1_048_576) },
    });
    expect(Buffer.byteLength(body)).toBeGreaterThan(1_048_576);
    const response = await mcpHandler.fetch(mcpRequest(body));
    expect(response.status).toBe(413);
  });

  it("builds a server per request for an authenticated caller", async () => {
    const user = await createUser({
      email: "mcp@example.com",
      name: "MCP",
      password: "password123",
      role: "admin",
    });
    const response = await mcpHandler.fetch(
      mcpRequest(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "dash-test", version: "0.0.0" },
          },
        }),
      ),
      {
        authInfo: {
          token: "test-token",
          clientId: user.id,
          scopes: ["read", "mcp"],
        },
      },
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    const payload = JSON.parse(jsonFromBody(text)) as {
      result?: { serverInfo?: { name?: string } };
    };
    expect(payload.result?.serverInfo?.name).toBe("dash");
  });

  it("rejects a tool call with too many input elements", async () => {
    const user = await createUser({
      email: "mcp-limit@example.com",
      name: "MCP",
      password: "password123",
      role: "admin",
    });
    const response = await mcpHandler.fetch(
      mcpRequest(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "query_data",
            arguments: {
              dataSourceId: "demo",
              resource: "orders",
              columns: Array.from({ length: 10_001 }, () => "id"),
            },
          },
        }),
      ),
      {
        authInfo: {
          token: "test-token",
          clientId: user.id,
          scopes: ["read", "mcp"],
        },
      },
    );
    expect(response.status).toBe(200);
    const payload = JSON.parse(jsonFromBody(await response.text())) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> };
    };
    expect(payload.result?.isError).toBe(true);
    expect(payload.result?.content?.[0]?.text).toContain("10000");
  });

  it("scopes MCP reads and writes to the selected workspace", async () => {
    const user = await createUser({ email: "mcp-workspace@example.com", name: "MCP", password: "password123", role: "admin" });
    const personal = await ensurePersonalWorkspace(user.id);
    const shared = await createWorkspace(user, "Shared");
    const privateDashboard = await createDashboard({ workspaceId: personal, name: "Private", description: "", widgets: [], createdBy: user.id });
    const info = { token: "test-token", clientId: user.id, scopes: ["read", "write", "mcp"], extra: { workspaceId: shared.id } };
    async function call(name: string, args = {}) {
      const response = await mcpHandler.fetch(mcpRequest(JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args },
      })), { authInfo: info });
      expect(response.status).toBe(200);
      return JSON.parse(jsonFromBody(await response.text())).result;
    }
    expect(JSON.parse((await call("list_dashboards")).content[0].text)).toEqual([]);
    expect((await call("get_dashboard", { dashboardId: privateDashboard.id })).isError).toBe(true);
    expect((await call("add_chart_widget", { dashboardId: privateDashboard.id, title: "No", dataSourceId: "demo", resource: "sales", chartType: "bar" })).isError).toBe(true);
    const dashboard = JSON.parse((await call("create_dashboard", { name: "Shared dashboard" })).content[0].text);
    expect(dashboard.workspaceId).toBe(shared.id);
    const updated = JSON.parse((await call("add_chart_widget", { dashboardId: dashboard.id, title: "Sales", dataSourceId: "demo", resource: "sales", chartType: "bar" })).content[0].text);
    expect(updated.widgets).toHaveLength(1);
    expect((await getDashboard(personal, privateDashboard.id))?.widgets).toEqual([]);
    expect(JSON.parse((await call("list_dashboards")).content[0].text).map((item: { id: string }) => item.id)).toEqual([dashboard.id]);
  });

  it("checks MCP membership again after a role change or removal", async () => {
    const owner = await createUser({ email: "owner@example.com", name: "Owner", password: "password123", role: "member" });
    const guest = await createUser({ email: "guest@example.com", name: "Guest", password: "password123", role: "admin" });
    const workspaceId = await ensurePersonalWorkspace(owner.id);
    await setWorkspaceMember(owner, workspaceId, guest.id, "editor");
    async function listTools() {
      return mcpHandler.fetch(mcpRequest(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })), {
        authInfo: { token: "test-token", clientId: guest.id, scopes: ["read", "write", "mcp"], extra: { workspaceId } },
      });
    }
    const editor = JSON.parse(jsonFromBody(await (await listTools()).text()));
    expect(editor.result.tools.map((tool: { name: string }) => tool.name)).toContain("create_dashboard");
    await setWorkspaceMember(owner, workspaceId, guest.id, "viewer");
    const viewer = JSON.parse(jsonFromBody(await (await listTools()).text()));
    expect(viewer.result.tools.map((tool: { name: string }) => tool.name)).not.toContain("create_dashboard");
    await setWorkspaceMember(owner, workspaceId, guest.id, null);
    const removed = await listTools();
    expect(removed.status).toBeGreaterThanOrEqual(400);
  });
});

function jsonFromBody(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const dataLine = trimmed
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("data:"));
  if (!dataLine) throw new Error(`No JSON body in MCP response: ${text.slice(0, 200)}`);
  return dataLine.slice(dataLine.indexOf("{"));
}
