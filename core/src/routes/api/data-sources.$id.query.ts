import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isResponse, requireUser } from "~/server/guard";
import { error, json, readJson } from "~/server/http";
import { getDataSource } from "~/server/services/data-sources";
import { queryDataSource } from "~/server/services/query";

const querySchema = z.object({
  resource: z.string(),
  columns: z.array(z.string()).optional(),
  filters: z
    .array(
      z.object({
        column: z.string(),
        op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "like", "ilike"]),
        value: z.unknown(),
      }),
    )
    .optional(),
  orderBy: z
    .array(
      z.object({
        column: z.string(),
        direction: z.enum(["asc", "desc"]),
      }),
    )
    .optional(),
  limit: z.number().int().positive().max(10_000).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export const Route = createFileRoute("/api/data-sources/$id/query")({
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
        const parsed = querySchema.safeParse(await readJson(request));
        if (!parsed.success) {
          return error(400, "Invalid query payload", "invalid_body");
        }
        try {
          const result = await queryDataSource(params.id, parsed.data);
          return json({ result });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Query failed";
          return error(400, message, "query_failed");
        }
      },
    },
  },
});
