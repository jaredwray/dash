import { createFileRoute } from "@tanstack/react-router";
import { deleteSessionByToken } from "~/server/auth";
import { getEnv } from "~/server/env";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  json,
  parseCookies,
} from "~/server/http";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cookies = parseCookies(request.headers.get("cookie"));
        const token = cookies[SESSION_COOKIE];
        if (token) {
          deleteSessionByToken(token);
        }
        return json(
          { ok: true },
          { headers: { "set-cookie": clearSessionCookie(getEnv().isProduction) } },
        );
      },
    },
  },
});
