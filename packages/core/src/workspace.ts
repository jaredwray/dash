export const WORKSPACE_ROLES = ["viewer", "editor"] as const;
export type WorkspaceMemberRole = (typeof WORKSPACE_ROLES)[number];

export interface Workspace {
  id: string;
  name: string;
  kind: "personal" | "shared";
  ownerId: string | null;
  role: WorkspaceMemberRole | "owner";
  canManage: boolean;
  createdAt: string;
}

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  role: WorkspaceMemberRole | "owner";
}
