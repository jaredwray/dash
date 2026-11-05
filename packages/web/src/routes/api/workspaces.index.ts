import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { error, json, readJson } from "~/server/http";
import { withWorkspaceSession } from "~/server/workspace-http";
import { createWorkspace, listWorkspaces } from "~/server/services/workspaces";

const schema = z.object({ name: z.string().trim().min(1).max(80) });

export const Route = createFileRoute("/api/workspaces/")({
  server: {
    handlers: {
      GET: ({ request }) =>
        withWorkspaceSession(request, async (user) =>
          json({ workspaces: await listWorkspaces(user) }),
        ),
      POST: ({ request }) =>
        withWorkspaceSession(request, async (user) => {
          const parsed = schema.safeParse(await readJson(request).catch(() => null));
          if (!parsed.success) return error(400, "Enter a workspace name", "invalid_body");
          return json(
            { workspace: await createWorkspace(user, parsed.data.name) },
            { status: 201 },
          );
        }),
    },
  },
});
