import { createFileRoute } from "@tanstack/react-router";
import { getAuthBootstrap } from "~/server/bootstrap";
import { error, json } from "~/server/http";

export const Route = createFileRoute("/api/auth/bootstrap")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return json(await getAuthBootstrap());
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Database unavailable";
          return error(503, message, "database_unavailable");
        }
      },
    },
  },
});
