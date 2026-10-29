import type { ApiTokenScope } from "@dash/core";
import { resolveAuth } from "./auth.ts";
import { ensureSeeded } from "./seed.ts";
import { error, hasScope, type AuthContext } from "./http.ts";

export async function withSeed<T>(fn: () => Promise<T> | T): Promise<T> {
  await ensureSeeded();
  return fn();
}

export async function requireUser(
  request: Request,
  scope: ApiTokenScope = "read",
): Promise<AuthContext | Response> {
  await ensureSeeded();
  const auth = resolveAuth(request);
  if (!auth) {
    return error(401, "Authentication required", "unauthenticated");
  }
  if (!hasScope(auth, scope)) {
    return error(403, `Missing scope: ${scope}`, "forbidden");
  }
  return auth;
}

export function isResponse(value: AuthContext | Response): value is Response {
  return value instanceof Response;
}
