import { createFileRoute } from "@tanstack/react-router";
import { isResponse, requireUser } from "~/server/guard";
import { error, json } from "~/server/http";
import { getDataSource } from "~/server/services/data-sources";
import { schemaForDataSource } from "~/server/services/query";

export const Route = createFileRoute("/api/data-sources/$id/schema")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireUser(request, "read");
        if (isResponse(auth)) {
          return auth;
        }
        if (!getDataSource(params.id)) {
          return error(404, "Data source not found", "not_found");
        }
        return json({ schema: await schemaForDataSource(params.id) });
      },
    },
  },
});
