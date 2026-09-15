export const USER_ROLES = ["admin", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface OrganizationSettings {
  name: string;
  allowRegistration: boolean;
}

export const API_TOKEN_SCOPES = ["read", "write", "mcp"] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

export function isApiTokenScope(value: string): value is ApiTokenScope {
  return (API_TOKEN_SCOPES as readonly string[]).includes(value);
}

export const API_TOKEN_PREFIX = "dash_live_";

export interface PublicApiToken {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiTokenScope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}
