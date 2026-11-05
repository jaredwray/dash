import { createFileRoute } from "@tanstack/react-router";
import { isResponse, requireWorkspace } from "~/server/guard";
import { mcpHandler } from "~/server/mcp";
import { bearerToken } from "~/server/http";

async function handle({ request }: { request: Request }) {
  const auth = await requireWorkspace(request, "mcp");
  if (isResponse(auth)) {
    return auth;
  }
  return mcpHandler.fetch(request, {
    authInfo: {
      token: bearerToken(request) ?? "session",
      clientId: auth.user.id,
      scopes: auth.scopes,
      extra: { workspaceId: auth.workspace.id },
    },
  });
}

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      DELETE: handle,
    },
  },
});
