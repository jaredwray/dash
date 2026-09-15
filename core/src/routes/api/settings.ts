import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isResponse, requireUser } from "~/server/guard";
import { error, isAdmin, json, readJson } from "~/server/http";
import { getSettings, updateSettings } from "~/server/services/settings";

const bodySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  allowRegistration: z.boolean().optional(),
});

export const Route = createFileRoute("/api/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request, "read");
        if (isResponse(auth)) {
          return auth;
        }
        return json({ settings: getSettings() });
      },
      PATCH: async ({ request }) => {
        const auth = await requireUser(request, "write");
        if (isResponse(auth)) {
          return auth;
        }
        if (!isAdmin(auth.user)) {
          return error(403, "Admin role required", "forbidden");
        }
        const parsed = bodySchema.safeParse(await readJson(request));
        if (!parsed.success) {
          return error(400, "Invalid settings payload", "invalid_body");
        }
        return json({ settings: updateSettings(parsed.data) });
      },
    },
  },
});
