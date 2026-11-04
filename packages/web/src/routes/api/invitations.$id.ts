import { createFileRoute } from "@tanstack/react-router";
import { isResponse, requireAdminSession } from "~/server/guard";
import { error, json } from "~/server/http";
import { revokeInvitation } from "~/server/services/team";

export const Route = createFileRoute("/api/invitations/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const auth = await requireAdminSession(request);
        if (isResponse(auth)) {
          return auth;
        }
        if (!(await revokeInvitation(params.id))) {
          return error(404, "Invitation not found", "not_found");
        }
        return json({ ok: true });
      },
    },
  },
});
