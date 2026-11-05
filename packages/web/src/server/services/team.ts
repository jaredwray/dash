import type {
  InvitationPreview,
  PublicInvitation,
  PublicUser,
  UserRole,
} from "@dash/core";
import { MongoServerError } from "mongodb";
import { EmailTakenError, createUser, findUserByEmail, toPublicUser } from "../auth.ts";
import { generateInvitationToken, hashSecret, randomId } from "../crypto.ts";
import { invitations, nowIso, users, type InvitationDoc } from "../db.ts";
import { assertEmailDomainAllowed } from "./account-policy.ts";
import { getSettings } from "./settings.ts";

export const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export class LastAdminError extends Error {
  constructor() {
    super("The organization needs at least one admin");
    this.name = "LastAdminError";
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isDuplicateKey(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}

function isExpired(row: Pick<InvitationDoc, "expiresAt">, now = Date.now()): boolean {
  return new Date(row.expiresAt).getTime() <= now;
}

/** Everyone with an account, oldest first so the founding admin leads the list. */
export async function listMembers(): Promise<PublicUser[]> {
  const rows = await (await users()).find().sort({ createdAt: 1, _id: 1 }).toArray();
  return rows.map(toPublicUser);
}

/**
 * Change a member's role. Demoting the last admin is refused. The check runs
 * after the write: if no admin remains, the change is reverted, so two admins
 * demoting each other at once cannot leave the organization without one.
 */
export async function setMemberRole(
  userId: string,
  role: UserRole,
): Promise<PublicUser | undefined> {
  const collection = await users();
  const before = await collection.findOneAndUpdate(
    { _id: userId },
    { $set: { role } },
    { returnDocument: "before" },
  );
  if (!before) {
    return undefined;
  }
  if (before.role === "admin" && role !== "admin") {
    const admins = await collection.countDocuments({ role: "admin" });
    if (admins === 0) {
      await collection.updateOne({ _id: userId, role }, { $set: { role: "admin" } });
      throw new LastAdminError();
    }
  }
  return toPublicUser({ ...before, role });
}

async function inviterNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return new Map();
  }
  const rows = await (await users())
    .find({ _id: { $in: unique } }, { projection: { name: 1 } })
    .toArray();
  return new Map(rows.map((row) => [row._id, row.name]));
}

function toPublicInvitation(
  row: InvitationDoc,
  names: Map<string, string>,
  now = Date.now(),
): PublicInvitation {
  const name = names.get(row.invitedBy);
  return {
    id: row._id,
    email: row.email,
    role: row.role,
    invitedBy: name === undefined ? null : { id: row.invitedBy, name },
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    status: isExpired(row, now) ? "expired" : "pending",
  };
}

/**
 * Issue a single-use invitation link for `email`. An open invitation for the
 * same address is replaced: its old link stops working and the new role and
 * expiry apply. The token is returned once; only its hash is stored.
 */
export async function createInvitation(input: {
  email: string;
  role: UserRole;
  invitedBy: string;
}): Promise<{ token: string; invitation: PublicInvitation }> {
  const email = normalizeEmail(input.email);
  if (await findUserByEmail(email)) {
    throw new EmailTakenError();
  }
  await assertEmailDomainAllowed(email);
  const collection = await invitations();
  const token = generateInvitationToken();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
  const upsert = () =>
    collection.findOneAndUpdate(
      { email, status: "pending" },
      {
        $set: {
          role: input.role,
          tokenHash: hashSecret(token),
          invitedBy: input.invitedBy,
          createdAt,
          expiresAt,
        },
        $setOnInsert: {
          _id: randomId(),
          acceptedAt: null,
          acceptedBy: null,
          revokedAt: null,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  let row: InvitationDoc | null;
  try {
    row = await upsert();
  } catch (error) {
    // Two concurrent invites for a new address both try to insert. The loser
    // retries as an update of the winner's row.
    if (!isDuplicateKey(error)) {
      throw error;
    }
    row = await upsert();
  }
  if (!row) {
    throw new Error("Invitation was not saved");
  }
  const names = await inviterNames([row.invitedBy]);
  return { token, invitation: toPublicInvitation(row, names) };
}

/** Open invitations, newest first. Expired ones stay listed so an admin can reissue them. */
export async function listInvitations(): Promise<PublicInvitation[]> {
  const rows = await (await invitations())
    .find({ status: "pending" })
    .sort({ createdAt: -1, _id: 1 })
    .toArray();
  const names = await inviterNames(rows.map((row) => row.invitedBy));
  const now = Date.now();
  return rows.map((row) => toPublicInvitation(row, names, now));
}

export async function revokeInvitation(id: string): Promise<boolean> {
  const result = await (
    await invitations()
  ).updateOne({ _id: id, status: "pending" }, { $set: { status: "revoked", revokedAt: nowIso() } });
  return result.matchedCount === 1;
}

async function findOpenInvitation(token: string): Promise<InvitationDoc | undefined> {
  const row = await (await invitations()).findOne({
    tokenHash: hashSecret(token),
    status: "pending",
  });
  if (!row || isExpired(row)) {
    return undefined;
  }
  return row;
}

export async function previewInvitation(token: string): Promise<InvitationPreview | undefined> {
  const row = await findOpenInvitation(token);
  if (!row) {
    return undefined;
  }
  const [names, settings] = await Promise.all([inviterNames([row.invitedBy]), getSettings()]);
  return {
    email: row.email,
    role: row.role,
    organizationName: settings.name,
    invitedByName: names.get(row.invitedBy) ?? null,
    expiresAt: row.expiresAt,
  };
}

/**
 * Create the invited account. The invitation is claimed atomically first, so
 * a link opened twice creates at most one user. If the account cannot be
 * created (for example the email registered in the meantime), the claim is
 * released and the error is rethrown.
 */
export async function acceptInvitation(input: {
  token: string;
  name: string;
  password: string;
}): Promise<PublicUser | undefined> {
  const collection = await invitations();
  const acceptedAt = nowIso();
  const claimed = await collection.findOneAndUpdate(
    { tokenHash: hashSecret(input.token), status: "pending", expiresAt: { $gt: acceptedAt } },
    { $set: { status: "accepted", acceptedAt } },
    { returnDocument: "after" },
  );
  if (!claimed) {
    return undefined;
  }
  let user: PublicUser;
  try {
    await assertEmailDomainAllowed(claimed.email);
    user = await createUser({
      email: claimed.email,
      name: input.name.trim(),
      password: input.password,
      role: claimed.role,
    });
  } catch (error) {
    await collection
      .updateOne(
        { _id: claimed._id, status: "accepted", acceptedBy: null },
        { $set: { status: "pending", acceptedAt: null } },
      )
      .catch(() => undefined);
    throw error;
  }
  await collection.updateOne({ _id: claimed._id }, { $set: { acceptedBy: user.id } });
  return user;
}
