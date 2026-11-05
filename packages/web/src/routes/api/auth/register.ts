import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { EmailTakenError, createSession } from "~/server/auth";
import { getEnv } from "~/server/env";
import { error, json, readJson, sessionCookie } from "~/server/http";
import { ensureSeeded } from "~/server/seed";
import { RegistrationDeniedError, registerAccount } from "~/server/services/account-policy";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(80),
});

export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await ensureSeeded();
        const parsed = bodySchema.safeParse(await readJson(request));
        if (!parsed.success) {
          return error(400, "Invalid registration payload", "invalid_body");
        }
        let user;
        try {
          user = await registerAccount({
            email: parsed.data.email,
            name: parsed.data.name,
            password: parsed.data.password,
          });
        } catch (cause) {
          if (cause instanceof EmailTakenError) {
            return error(409, "Email already registered", "email_taken");
          }
          if (cause instanceof RegistrationDeniedError) {
            return error(403, cause.message, cause.code);
          }
          throw cause;
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
