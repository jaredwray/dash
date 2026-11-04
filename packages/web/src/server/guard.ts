import type { ApiTokenScope } from "@dash/core";
import { resolveAuth } from "./auth.ts";
import { ensureSeeded } from "./seed.ts";
import { error, hasScope, isAdmin, type AuthContext } from "./http.ts";

export async function withSeed<T>(fn: () => Promise<T> | T): Promise<T> {
  await ensureSeeded();
  return fn();
}

export async function requireUser(
  request: Request,
  scope: ApiTokenScope = "read",
): Promise<AuthContext | Response> {
  await ensureSeeded();
  const auth = await resolveAuth(request);
  if (!auth) {
    return error(401, "Authentication required", "unauthenticated");
  }
  if (!hasScope(auth, scope)) {
    return error(403, `Missing scope: ${scope}`, "forbidden");
  }
  return auth;
}

/**
 * Team management mints accounts and changes roles, so it needs an admin's
 * browser session. An API token, even an admin's, cannot invite or promote.
 */
export async function requireAdminSession(request: Request): Promise<AuthContext | Response> {
  const auth = await requireUser(request, "write");
  if (isResponse(auth)) {
    return auth;
  }
  if (auth.via === "token") {
    return error(403, "Session authentication required to manage the team", "forbidden");
  }
  if (!isAdmin(auth.user)) {
    return error(403, "Admin role required", "forbidden");
  }
  return auth;
}

export function isResponse(value: AuthContext | Response): value is Response {
  return value instanceof Response;
}
