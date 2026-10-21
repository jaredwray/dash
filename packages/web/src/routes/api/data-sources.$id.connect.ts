import { createFileRoute } from "@tanstack/react-router";
import { isResponse, requireUser } from "~/server/guard";
import { error, json } from "~/server/http";
import { getDataSource } from "~/server/services/data-sources";
import { testDataSourceConnection } from "~/server/services/query";

export const Route = createFileRoute("/api/data-sources/$id/connect")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireUser(request, "read");
        if (isResponse(auth)) {
          return auth;
        }
        if (!getDataSource(params.id)) {
          return error(404, "Data source not found", "not_found");
        }
        return json({ result: await testDataSourceConnection(params.id) });
      },
    },
  },
});
