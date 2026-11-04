import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { error, json, readJson } from "~/server/http";
import { ensureSeeded } from "~/server/seed";
import { previewInvitation } from "~/server/services/team";

// The token travels in the body, not the URL, so it stays out of access logs.
const bodySchema = z.object({
  token: z.string().min(1).max(200),
});

export const Route = createFileRoute("/api/auth/invitation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await ensureSeeded();
        const parsed = bodySchema.safeParse(await readJson(request).catch(() => null));
        if (!parsed.success) {
          return error(400, "Invalid invitation payload", "invalid_body");
        }
        const invitation = await previewInvitation(parsed.data.token);
        if (!invitation) {
          return error(404, "This invitation is invalid or has expired", "invitation_invalid");
        }
        return json({ invitation });
      },
    },
  },
});
