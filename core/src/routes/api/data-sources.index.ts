import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isResponse, requireUser } from "~/server/guard";
import { error, isAdmin, json, readJson } from "~/server/http";
import {
  createDataSource,
  listDataSources,
} from "~/server/services/data-sources";
import { testConnectionConfig } from "~/server/services/query";

const configSchema = z.discriminatedUnion("kind", [
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
]);

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  config: configSchema,
});

export const Route = createFileRoute("/api/data-sources/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request, "read");
        if (isResponse(auth)) {
          return auth;
        }
        return json({ dataSources: listDataSources() });
      },
      POST: async ({ request }) => {
        const auth = await requireUser(request, "write");
        if (isResponse(auth)) {
          return auth;
        }
        if (!isAdmin(auth.user)) {
          return error(403, "Admin role required", "forbidden");
        }
        const parsed = createSchema.safeParse(await readJson(request));
        if (!parsed.success) {
          return error(400, "Invalid data source payload", "invalid_body");
        }
        const test = await testConnectionConfig(parsed.data.config);
        if (!test.ok) {
          return error(400, test.message, "connection_failed");
        }
        const dataSource = createDataSource({
          name: parsed.data.name,
          description: parsed.data.description ?? "",
          config: parsed.data.config,
          createdBy: auth.user.id,
        });
        return json({ dataSource }, { status: 201 });
      },
    },
  },
});
