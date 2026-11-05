import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { WORKSPACE_ROLES } from "@dash/core";
import { error, json, readJson } from "~/server/http";
import { withWorkspaceSession } from "~/server/workspace-http";
import { listWorkspaceMembers, setWorkspaceMember } from "~/server/services/workspaces";

const schema = z.object({ userId: z.string().min(1), role: z.enum(WORKSPACE_ROLES).nullable() });

export const Route = createFileRoute("/api/workspaces/$id/members")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        withWorkspaceSession(request, async (user) =>
          json({ members: await listWorkspaceMembers(user, params.id) }),
        ),
      PUT: ({ request, params }) =>
        withWorkspaceSession(request, async (user) => {
          const parsed = schema.safeParse(await readJson(request).catch(() => null));
          if (!parsed.success) return error(400, "Invalid workspace access", "invalid_body");
          await setWorkspaceMember(user, params.id, parsed.data.userId, parsed.data.role);
          return json({ ok: true });
        }),
    },
  },
});
