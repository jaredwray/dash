import { error } from "./http.ts";
import { isResponse, requireUser } from "./guard.ts";
import type { PublicUser } from "@dash/core";
import { WorkspaceError } from "./services/workspaces.ts";

export async function withWorkspaceSession(
  request: Request,
  action: (user: PublicUser) => Promise<Response>,
): Promise<Response> {
  const auth = await requireUser(request);
  if (isResponse(auth)) return auth;
  if (auth.via !== "session")
    return error(403, "Session authentication required to manage workspaces", "forbidden");
  try {
    return await action(auth.user);
  } catch (cause) {
    if (cause instanceof WorkspaceError)
      return error(cause.status, cause.message, "workspace_access");
    throw cause;
  }
}
