import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isResponse, requireAdminSession } from "~/server/guard";
import { error, json, readJson } from "~/server/http";
import {
  DevSeedError,
  devSeedEnabled,
  getDevSeedPlan,
  getDevSeedState,
  startDevSeed,
  startDevSeedRemoval,
} from "~/server/services/dev-seed";
import { ServerClosingError } from "~/server/shutdown";

const sizeSchema = z.enum(["small", "standard"]);
const startSchema = z.object({
  planId: z.string().min(1).max(64),
  size: sizeSchema,
});

function disabled(): Response {
  return error(404, "Not found", "not_found");
}

function failure(cause: unknown): Response {
  if (cause instanceof DevSeedError) return error(cause.status, cause.message, cause.code);
  if (cause instanceof ServerClosingError) return error(503, cause.message, "server_closing");
  throw cause;
}

/**
 * Development seeding. Each method answers 404 unless DASH_SEED_DEV_SOURCES
 * is true outside production. It writes into data sources, so it needs an
 * admin browser session. API tokens and MCP cannot call it.
 */
export const Route = createFileRoute("/api/dev-seed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!devSeedEnabled()) return disabled();
        const auth = await requireAdminSession(request);
        if (isResponse(auth)) return auth;
        const size = sizeSchema.catch("standard").parse(new URL(request.url).searchParams.get("size") ?? "standard");
        return json({ plan: await getDevSeedPlan(size), state: await getDevSeedState() });
      },
      POST: async ({ request }) => {
        if (!devSeedEnabled()) return disabled();
        const auth = await requireAdminSession(request);
        if (isResponse(auth)) return auth;
        const parsed = startSchema.safeParse(await readJson(request).catch(() => null));
        if (!parsed.success) return error(400, "Invalid seed request", "invalid_body");
        try {
          return json({ state: await startDevSeed(auth.user, parsed.data.planId, parsed.data.size) }, { status: 202 });
        } catch (cause) {
          return failure(cause);
        }
      },
      DELETE: async ({ request }) => {
        if (!devSeedEnabled()) return disabled();
        const auth = await requireAdminSession(request);
        if (isResponse(auth)) return auth;
        try {
          return json({ state: await startDevSeedRemoval(auth.user) }, { status: 202 });
        } catch (cause) {
          return failure(cause);
        }
      },
    },
  },
});
