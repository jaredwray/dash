import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { API_TOKEN_SCOPES, type ApiTokenScope } from "@dash/core";
import { issueApiToken, listTokens } from "~/server/auth";
import { isResponse, requireUser } from "~/server/guard";
import { error, json, readJson } from "~/server/http";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.enum(API_TOKEN_SCOPES)).min(1),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

export const Route = createFileRoute("/api/tokens/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request, "read");
        if (isResponse(auth)) {
          return auth;
        }
        if (auth.via === "token") {
          return error(403, "Session authentication required to manage tokens", "forbidden");
        }
        return json({ tokens: listTokens(auth.user.id) });
      },
      POST: async ({ request }) => {
        const auth = await requireUser(request, "write");
        if (isResponse(auth)) {
          return auth;
        }
        if (auth.via === "token") {
          return error(403, "Session authentication required to manage tokens", "forbidden");
        }
        const parsed = createSchema.safeParse(await readJson(request));
        if (!parsed.success) {
          return error(400, "Invalid token payload", "invalid_body");
        }
        const expiresAt = parsed.data.expiresInDays
          ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000).toISOString()
          : null;
        const issued = issueApiToken({
          userId: auth.user.id,
          name: parsed.data.name,
          scopes: parsed.data.scopes as ApiTokenScope[],
          expiresAt,
        });
        return json(
          {
            token: issued.token,
            record: issued.record,
          },
          { status: 201 },
        );
      },
    },
  },
});
