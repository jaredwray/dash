import { createFileRoute } from "@tanstack/react-router";
import { isResponse, requireUser } from "~/server/guard";
import { mcpHandler } from "~/server/mcp";
import { bearerToken } from "~/server/http";

async function handle({ request }: { request: Request }) {
  const auth = await requireUser(request, "mcp");
  if (isResponse(auth)) {
    return auth;
  }
  return mcpHandler.fetch(request, {
    authInfo: {
      token: bearerToken(request) ?? "session",
      clientId: auth.user.id,
      scopes: auth.scopes,
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
