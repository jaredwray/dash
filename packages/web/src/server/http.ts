import type { ApiTokenScope, PublicUser, UserRole } from "@dash/core";

export const SESSION_COOKIE = "dash_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export interface AuthContext {
  user: PublicUser;
  scopes: ApiTokenScope[];
  via: "session" | "token";
  tokenId?: string;
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, init);
}

export function error(
  status: number,
  message: string,
  code = "error",
): Response {
  return Response.json({ error: { message, code } }, { status });
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export function sessionCookie(token: string, isProduction: boolean): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (isProduction) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function clearSessionCookie(isProduction: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProduction) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim();
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export function hasScope(auth: AuthContext, scope: ApiTokenScope): boolean {
  return auth.scopes.includes(scope);
}

export function isAdmin(user: { role: UserRole }): boolean {
  return user.role === "admin";
}
