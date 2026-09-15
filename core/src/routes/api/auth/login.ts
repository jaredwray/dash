import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticatePassword, createSession } from "~/server/auth";
import { getEnv } from "~/server/env";
import { error, json, readJson, sessionCookie } from "~/server/http";
import { ensureSeeded } from "~/server/seed";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await ensureSeeded();
        const parsed = bodySchema.safeParse(await readJson(request));
        if (!parsed.success) {
          return error(400, "Invalid login payload", "invalid_body");
        }
        const user = await authenticatePassword(
          parsed.data.email.trim().toLowerCase(),
          parsed.data.password,
        );
        if (!user) {
          return error(401, "Invalid email or password", "invalid_credentials");
        }
        const token = createSession(user.id);
        return json(
          { user },
          {
            headers: { "set-cookie": sessionCookie(token, getEnv().isProduction) },
          },
        );
      },
    },
  },
});
