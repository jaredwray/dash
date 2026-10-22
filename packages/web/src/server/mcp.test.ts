import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth.ts";
import { closeDb } from "./db.ts";
import { mcpHandler } from "./mcp.ts";

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
  beforeEach(() => {
    process.env.DASH_SECRET = "unit-test-secret";
    process.env.DASH_SEED_DEMO = "false";
    process.env.DASH_DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "dash-mcp-")), "test.sqlite");
    closeDb();
  });

  afterEach(() => {
    closeDb();
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
