import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  EmailTakenError,
  createSession,
  createUser,
  findUserByEmail,
  grantInitialAdmin,
} from "~/server/auth";
import { getEnv } from "~/server/env";
import { error, json, readJson, sessionCookie } from "~/server/http";
import { ensureSeeded } from "~/server/seed";
import { registrationPolicy } from "~/server/services/account-policy";

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
        const email = parsed.data.email.trim().toLowerCase();
        const policy = await registrationPolicy(email);
        if (policy.denial) {
          return error(403, policy.denial.message, policy.denial.code);
        }
        const userCount = policy.userCount;
        if (await findUserByEmail(email)) {
          return error(409, "Email already registered", "email_taken");
        }
        let user;
        try {
          user = await createUser({
            email,
            name: parsed.data.name.trim(),
            password: parsed.data.password,
            role: "member",
          });
        } catch (cause) {
          if (cause instanceof EmailTakenError) {
            return error(409, "Email already registered", "email_taken");
          }
          throw cause;
        }
        if (userCount === 0 && (await grantInitialAdmin(user.id))) {
          user = { ...user, role: "admin" };
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
