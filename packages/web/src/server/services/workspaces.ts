import type { PublicUser, Workspace, WorkspaceMember, WorkspaceMemberRole } from "@dash/core";
import { MongoServerError } from "mongodb";
import { randomId } from "../crypto.ts";
import { nowIso, users, workspaces, type WorkspaceDoc } from "../db.ts";

export class WorkspaceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

function toWorkspace(row: WorkspaceDoc, user: PublicUser): Workspace | undefined {
  const canManage = row.kind === "personal" ? row.ownerId === user.id : user.role === "admin";
  const role = canManage ? "owner" : row.members.find((member) => member.userId === user.id)?.role;
  if (!role) return undefined;
  return {
    id: row._id,
    name: row.name,
    kind: row.kind,
    ownerId: row.ownerId,
    role,
    canManage,
    createdAt: row.createdAt,
  };
}

/** The unique owner index also protects concurrent account requests. */
export async function ensurePersonalWorkspace(userId: string): Promise<string> {
  const collection = await workspaces();
  const id = `personal:${userId}`;
  try {
    await collection.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          name: "Personal",
          kind: "personal",
          ownerId: userId,
          members: [],
          createdAt: nowIso(),
        },
      },
      { upsert: true },
    );
  } catch (cause) {
    if (!(cause instanceof MongoServerError) || cause.code !== 11000) throw cause;
    if (!(await collection.findOne({ _id: id, kind: "personal", ownerId: userId }))) throw cause;
  }
  return id;
}

export async function listWorkspaces(user: PublicUser): Promise<Workspace[]> {
  await ensurePersonalWorkspace(user.id);
  const rows = await (
    await workspaces()
  )
    .find({
      $or: [
        { ownerId: user.id },
        { "members.userId": user.id },
        ...(user.role === "admin" ? [{ kind: "shared" as const }] : []),
      ],
    })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  return rows.flatMap((row) => {
    const workspace = toWorkspace(row, user);
    return workspace ? [workspace] : [];
  });
}

export async function getWorkspace(user: PublicUser, id: string): Promise<Workspace> {
  const row = await (await workspaces()).findOne({ _id: id });
  const workspace = row && toWorkspace(row, user);
  if (!workspace) throw new WorkspaceError(404, "Workspace not found");
  return workspace;
}

export async function createWorkspace(user: PublicUser, name: string): Promise<Workspace> {
  if (user.role !== "admin")
    throw new WorkspaceError(403, "Only organization admins can create shared workspaces");
  const row: WorkspaceDoc = {
    _id: randomId(),
    name,
    kind: "shared",
    ownerId: null,
    members: [],
    createdAt: nowIso(),
  };
  await (await workspaces()).insertOne(row);
  return toWorkspace(row, user)!;
}

async function managedWorkspace(user: PublicUser, id: string): Promise<Workspace> {
  const workspace = await getWorkspace(user, id);
  if (!workspace.canManage) throw new WorkspaceError(403, "You cannot manage this workspace");
  return workspace;
}

export async function renameWorkspace(
  user: PublicUser,
  id: string,
  name: string,
): Promise<Workspace> {
  await managedWorkspace(user, id);
  await (await workspaces()).updateOne({ _id: id }, { $set: { name } });
  return getWorkspace(user, id);
}

export async function listWorkspaceMembers(
  user: PublicUser,
  id: string,
): Promise<WorkspaceMember[]> {
  await managedWorkspace(user, id);
  const row = (await (await workspaces()).findOne({ _id: id }))!;
  const ids = row.members.map((member) => member.userId);
  if (row.ownerId) ids.push(row.ownerId);
  const people = await (
    await users()
  )
    .find({
      $or: [{ _id: { $in: ids } }, ...(row.kind === "shared" ? [{ role: "admin" as const }] : [])],
    })
    .sort({ name: 1, _id: 1 })
    .toArray();
  return people.map((person) => ({
    id: person._id,
    name: person.name,
    email: person.email,
    role:
      row.ownerId === person._id || (row.kind === "shared" && person.role === "admin")
        ? "owner"
        : row.members.find((member) => member.userId === person._id)!.role,
  }));
}

export async function setWorkspaceMember(
  user: PublicUser,
  id: string,
  userId: string,
  role: WorkspaceMemberRole | null,
): Promise<void> {
  const workspace = await managedWorkspace(user, id);
  const person = await (await users()).findOne({ _id: userId });
  if (!person) throw new WorkspaceError(404, "Organization member not found");
  if (workspace.ownerId === userId || (workspace.kind === "shared" && person.role === "admin")) {
    throw new WorkspaceError(400, "You cannot change the workspace manager's access");
  }
  // One atomic update prevents duplicate grants and lost concurrent changes.
  await (
    await workspaces()
  ).updateOne({ _id: id }, [
    {
      $set: {
        members: {
          $concatArrays: [
            {
              $filter: {
                input: "$members",
                as: "member",
                cond: { $ne: ["$$member.userId", { $literal: userId }] },
              },
            },
            { $literal: role === null ? [] : [{ userId, role }] },
          ],
        },
      },
    },
  ]);
}
