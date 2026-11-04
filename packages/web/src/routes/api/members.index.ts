import { createFileRoute } from "@tanstack/react-router";
import { isResponse, requireUser } from "~/server/guard";
import { json } from "~/server/http";
import { listMembers } from "~/server/services/team";

export const Route = createFileRoute("/api/members/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request, "read");
        if (isResponse(auth)) {
          return auth;
        }
        return json({ members: await listMembers() });
      },
    },
  },
});
