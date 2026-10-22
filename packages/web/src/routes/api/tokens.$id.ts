import { createFileRoute } from "@tanstack/react-router";
import { revokeApiToken } from "~/server/auth";
import { isResponse, requireUser } from "~/server/guard";
import { error, json } from "~/server/http";

export const Route = createFileRoute("/api/tokens/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const auth = await requireUser(request, "write");
        if (isResponse(auth)) {
          return auth;
        }
        if (auth.via === "token") {
          return error(403, "Session authentication required to manage tokens", "forbidden");
        }
        if (!revokeApiToken(auth.user.id, params.id)) {
          return error(404, "Token not found", "not_found");
        }
        return json({ ok: true });
      },
    },
  },
});
