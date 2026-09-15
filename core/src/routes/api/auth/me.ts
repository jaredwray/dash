import { createFileRoute } from "@tanstack/react-router";
import { isResponse, requireUser } from "~/server/guard";
import { json } from "~/server/http";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request, "read");
        if (isResponse(auth)) {
          return auth;
        }
        return json({ user: auth.user });
      },
    },
  },
});
