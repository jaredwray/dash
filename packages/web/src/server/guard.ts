import type { ApiTokenScope } from "@dash/core";
import { resolveAuth } from "./auth.ts";
import { ensureSeeded } from "./seed.ts";
import { error, hasScope, isAdmin, type AuthContext, type WorkspaceAuthContext } from "./http.ts";
import { ensurePersonalWorkspace, getWorkspace, WorkspaceError } from "./services/workspaces.ts";

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

export async function requireWorkspace(
  request: Request, scope: ApiTokenScope = "read",
): Promise<WorkspaceAuthContext | Response> {
  const auth = await requireUser(request, scope);
  if (isResponse(auth)) return auth;
  const requestedId = request.headers.get("x-dash-workspace-id");
  if (auth.via === "token" && requestedId && requestedId !== auth.workspaceId) {
    return error(403, "This token belongs to a different workspace", "forbidden");
  }
  const id = auth.via === "token" ? auth.workspaceId : requestedId ?? await ensurePersonalWorkspace(auth.user.id);
  if (!id) return error(403, "The token has no workspace", "forbidden");
  try {
    const workspace = await getWorkspace(auth.user, id);
    if (scope === "write" && workspace.role === "viewer") {
      return error(403, "Editor access required", "forbidden");
    }
    return { ...auth, workspace };
  } catch (cause) {
    if (cause instanceof WorkspaceError) return error(cause.status, cause.message, "workspace_access");
    throw cause;
  }
}
