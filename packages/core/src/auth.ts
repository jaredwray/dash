export const USER_ROLES = ["admin", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Display names. `member` is stored for compatibility and shown as "User". */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  member: "User",
};

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

/** A pending invitation as administrators see it. The link token is never listed. */
export interface PublicInvitation {
  id: string;
  email: string;
  role: UserRole;
  invitedBy: { id: string; name: string } | null;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "expired";
}

/** What the person holding an invitation link sees before creating the account. */
export interface InvitationPreview {
  email: string;
  role: UserRole;
  organizationName: string;
  invitedByName: string | null;
  expiresAt: string;
}

export interface OrganizationSettings {
  name: string;
  allowRegistration: boolean;
  /** Host names that can create accounts. An empty list allows every domain. */
  allowedEmailDomains: string[];
}

export const API_TOKEN_SCOPES = ["read", "write", "mcp"] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

export function isApiTokenScope(value: string): value is ApiTokenScope {
  return (API_TOKEN_SCOPES as readonly string[]).includes(value);
}

export const API_TOKEN_PREFIX = "dash_live_";

export interface PublicApiToken {
  workspaceId: string;
  id: string;
  name: string;
  prefix: string;
  scopes: ApiTokenScope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}
