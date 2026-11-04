import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { USER_ROLES } from "@dash/core";
import { isResponse, requireAdminSession } from "~/server/guard";
import { error, json, readJson } from "~/server/http";
import { LastAdminError, setMemberRole } from "~/server/services/team";

const bodySchema = z.object({
  role: z.enum(USER_ROLES),
});

export const Route = createFileRoute("/api/members/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await requireAdminSession(request);
        if (isResponse(auth)) {
          return auth;
        }
        const parsed = bodySchema.safeParse(await readJson(request).catch(() => null));
        if (!parsed.success) {
          return error(400, "Invalid member payload", "invalid_body");
        }
        let member;
        try {
          member = await setMemberRole(params.id, parsed.data.role);
        } catch (cause) {
          if (cause instanceof LastAdminError) {
            return error(409, cause.message, "last_admin");
          }
          throw cause;
        }
        if (!member) {
          return error(404, "Member not found", "not_found");
        }
        return json({ member });
      },
    },
  },
});
