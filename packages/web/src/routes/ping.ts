import { createFileRoute } from "@tanstack/react-router";
import { pingResponse } from "~/server/health";

export const Route = createFileRoute("/ping")({
  server: {
    handlers: {
      GET: async () => pingResponse(),
    },
  },
});
