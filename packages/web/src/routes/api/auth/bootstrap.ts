import { createFileRoute } from "@tanstack/react-router";
import { getAuthBootstrap } from "~/server/bootstrap";
import { json } from "~/server/http";

export const Route = createFileRoute("/api/auth/bootstrap")({
  server: {
    handlers: {
      GET: async () => json(await getAuthBootstrap()),
    },
  },
});
