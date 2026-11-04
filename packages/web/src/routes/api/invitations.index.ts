import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { USER_ROLES } from "@dash/core";
import { EmailTakenError } from "~/server/auth";
import { isResponse, requireAdminSession } from "~/server/guard";
import { error, json, readJson } from "~/server/http";
import { createInvitation, listInvitations } from "~/server/services/team";

const createSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(USER_ROLES),
});

export const Route = createFileRoute("/api/invitations/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdminSession(request);
        if (isResponse(auth)) {
          return auth;
        }
        return json({ invitations: await listInvitations() });
      },
      POST: async ({ request }) => {
        const auth = await requireAdminSession(request);
        if (isResponse(auth)) {
          return auth;
        }
        const parsed = createSchema.safeParse(await readJson(request).catch(() => null));
        if (!parsed.success) {
          return error(400, "Invalid invitation payload", "invalid_body");
        }
        try {
          const issued = await createInvitation({
            email: parsed.data.email,
            role: parsed.data.role,
            invitedBy: auth.user.id,
          });
          return json(issued, { status: 201 });
        } catch (cause) {
          if (cause instanceof EmailTakenError) {
            return error(409, "That email already belongs to a team member", "email_taken");
          }
          throw cause;
        }
      },
    },
  },
});
