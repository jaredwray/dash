import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isResponse, requireUser } from "~/server/guard";
import { error, isAdmin, json, readJson } from "~/server/http";
import {
  deleteDataSource,
  getDataSource,
  updateDataSource,
} from "~/server/services/data-sources";
import { testConnectionConfig } from "~/server/services/query";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  config: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("demo") }),
      z.object({
        kind: z.literal("postgres"),
        connectionString: z.string().optional(),
        host: z.string().optional(),
        port: z.number().int().optional(),
        database: z.string().optional(),
        user: z.string().optional(),
        password: z.string().optional(),
        ssl: z.boolean().optional(),
      }),
    ])
    .optional(),
});

export const Route = createFileRoute("/api/data-sources/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireUser(request, "read");
        if (isResponse(auth)) {
          return auth;
        }
        const dataSource = getDataSource(params.id);
        if (!dataSource) {
          return error(404, "Data source not found", "not_found");
        }
        return json({ dataSource });
      },
      PATCH: async ({ request, params }) => {
        const auth = await requireUser(request, "write");
        if (isResponse(auth)) {
          return auth;
        }
        if (!isAdmin(auth.user)) {
          return error(403, "Admin role required", "forbidden");
        }
        const parsed = patchSchema.safeParse(await readJson(request));
        if (!parsed.success) {
          return error(400, "Invalid data source payload", "invalid_body");
        }
        if (parsed.data.config) {
          const test = await testConnectionConfig(parsed.data.config);
          if (!test.ok) {
            return error(400, test.message, "connection_failed");
          }
        }
        const dataSource = updateDataSource(params.id, parsed.data);
        if (!dataSource) {
          return error(404, "Data source not found", "not_found");
        }
        return json({ dataSource });
      },
      DELETE: async ({ request, params }) => {
        const auth = await requireUser(request, "write");
        if (isResponse(auth)) {
          return auth;
        }
        if (!isAdmin(auth.user)) {
          return error(403, "Admin role required", "forbidden");
        }
        if (!deleteDataSource(params.id)) {
          return error(404, "Data source not found", "not_found");
        }
        return json({ ok: true });
      },
    },
  },
});
