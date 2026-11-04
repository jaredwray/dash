import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { EmailTakenError, createSession } from "~/server/auth";
import { getEnv } from "~/server/env";
import { error, json, readJson, sessionCookie } from "~/server/http";
import { ensureSeeded } from "~/server/seed";
import { acceptInvitation } from "~/server/services/team";

const bodySchema = z.object({
  token: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8),
});

/** Accepting an invitation works even while open registration is turned off. */
export const Route = createFileRoute("/api/auth/invitation/accept")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await ensureSeeded();
        const parsed = bodySchema.safeParse(await readJson(request).catch(() => null));
        if (!parsed.success) {
          return error(400, "Invalid invitation payload", "invalid_body");
        }
        let user;
        try {
          user = await acceptInvitation(parsed.data);
        } catch (cause) {
          if (cause instanceof EmailTakenError) {
            return error(409, "An account with this email already exists. Log in instead.", "email_taken");
          }
          throw cause;
        }
        if (!user) {
          return error(404, "This invitation is invalid or has expired", "invitation_invalid");
        }
        const token = await createSession(user.id);
        return json(
          { user },
          {
            status: 201,
            headers: { "set-cookie": sessionCookie(token, getEnv().isProduction) },
          },
        );
      },
    },
  },
});
