import {
  type ApiTokenScope,
  type PublicUser,
  isApiTokenFormat,
  publicTokenPrefix,
} from "@dash/core";
import { getEnv } from "./env.ts";
import { getWorkspace } from "./services/workspaces.ts";
import { MongoServerError } from "mongodb";
import { apiTokens, getDb, nowIso, sessions, users, type ApiTokenDoc, type UserDoc } from "./db.ts";
import {
  generateApiToken,
  generateSessionToken,
  hashPassword,
  hashSecret,
  randomId,
  safeEqualHex,
  verifyPassword,
} from "./crypto.ts";
import {
  type AuthContext,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  bearerToken,
  parseCookies,
} from "./http.ts";

export class EmailTakenError extends Error {
  constructor() {
    super("Email already registered");
    this.name = "EmailTakenError";
  }
}

export function toPublicUser(row: UserDoc): PublicUser {
  return {
    id: row._id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.createdAt,
  };
}

/** A pending account cannot sign in. Older documents have no state and stay active. */
export function isActiveAccount(user: Pick<UserDoc, "accountState">): boolean {
  return user.accountState !== "pending";
}

export function countUsers(): Promise<number> {
  return users().then((collection) =>
    collection.countDocuments({ accountState: { $ne: "pending" } }),
  );
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: PublicUser["role"];
  accountState?: "pending";
}): Promise<PublicUser> {
  const id = randomId();
  const createdAt = nowIso();
  const passwordHash = await hashPassword(input.password);
  try {
    await (
      await users()
    ).insertOne({
      _id: id,
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash,
      createdAt,
      ...(input.accountState === "pending" ? { accountState: "pending" as const } : {}),
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new EmailTakenError();
    }
    throw error;
  }
  return {
    id,
    email: input.email,
    name: input.name,
    role: input.role,
    createdAt,
  };
}

/** Replace the name and password on a pending account. An active account is left unchanged. */
export async function revisePendingAccount(
  userId: string,
  input: { name: string; password: string },
): Promise<boolean> {
  const passwordHash = await hashPassword(input.password);
  const result = await (
    await users()
  ).updateOne(
    { _id: userId, accountState: "pending" },
    { $set: { name: input.name, passwordHash } },
  );
  return result.matchedCount === 1;
}

/** Mark a pending account active and return it. */
export async function activateAccount(userId: string): Promise<PublicUser> {
  const row = await (
    await users()
  ).findOneAndUpdate(
    { _id: userId },
    { $set: { accountState: "active" } },
    { returnDocument: "after" },
  );
  if (!row || !isActiveAccount(row)) {
    throw new Error("User not found");
  }
  return toPublicUser(row);
}

async function bootstrapAdminId(): Promise<string | undefined> {
  const settings = (await getDb()).collection<{ _id: string; adminUserId?: string }>("settings");
  const doc = await settings.findOne({ _id: "bootstrap" });
  return doc?.adminUserId;
}

/**
 * Activate the account that already claimed the first admin.
 * Return undefined when this account does not own that claim.
 */
export async function finishBootstrapAdmin(userId: string): Promise<PublicUser | undefined> {
  if ((await bootstrapAdminId()) !== userId) {
    return undefined;
  }
  const row = await (
    await users()
  ).findOneAndUpdate(
    { _id: userId },
    { $set: { role: "admin", accountState: "active" } },
    { returnDocument: "after" },
  );
  return row ? toPublicUser(row) : undefined;
}

/**
 * Remove a pending account. Do not remove the account that claimed the first admin.
 * Restore that account when the claim lands during the delete.
 */
export async function releasePendingAccount(userId: string): Promise<void> {
  if ((await bootstrapAdminId()) === userId) {
    return;
  }
  const deleted = await (
    await users()
  ).findOneAndDelete({ _id: userId, accountState: "pending" });
  if (!deleted) {
    return;
  }
  if ((await bootstrapAdminId()) !== userId) {
    return;
  }
  try {
    await (await users()).insertOne(deleted);
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) {
      throw error;
    }
  }
}

export async function findUserByEmail(email: string): Promise<UserDoc | undefined> {
  const row = await (await users()).findOne({ email });
  return row ?? undefined;
}

export async function findUserById(id: string): Promise<UserDoc | undefined> {
  const row = await (await users()).findOne({ _id: id });
  return row ?? undefined;
}

/**
 * The first successful claim on an empty app database becomes admin.
 * Later callers are not promoted.
 */
export async function grantInitialAdmin(userId: string): Promise<boolean> {
  const settings = (await getDb()).collection<{ _id: string; adminUserId?: string }>("settings");
  let adminUserId: string | undefined;
  try {
    const doc = await settings.findOneAndUpdate(
      { _id: "bootstrap" },
      { $setOnInsert: { adminUserId: userId } },
      { upsert: true, returnDocument: "after" },
    );
    adminUserId = doc?.adminUserId;
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) {
      throw error;
    }
    adminUserId = (await settings.findOne({ _id: "bootstrap" }))?.adminUserId;
  }
  if (adminUserId !== userId) {
    return false;
  }
  const result = await (
    await users()
  ).updateOne({ _id: userId }, { $set: { role: "admin", accountState: "active" } });
  if (result.matchedCount !== 1) {
    throw new Error("The first account was not activated");
  }
  return true;
}

export async function assertUserExists(userId: string): Promise<void> {
  const user = await findUserById(userId);
  if (!user || !isActiveAccount(user)) {
    throw new Error("User not found");
  }
}

export async function authenticatePassword(
  email: string,
  password: string,
): Promise<PublicUser | undefined> {
  const user = await findUserByEmail(email);
  if (!user) {
    return undefined;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok || !isActiveAccount(user)) {
    return undefined;
  }
  return toPublicUser(user);
}

export async function createSession(userId: string): Promise<string> {
  await assertUserExists(userId);
  const token = generateSessionToken();
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await (
    await sessions()
  ).insertOne({
    _id: randomId(),
    userId,
    tokenHash: hashSecret(token),
    expiresAt: expires,
    createdAt: nowIso(),
  });
  return token;
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await (await sessions()).deleteOne({ tokenHash: hashSecret(token) });
}

async function sessionUser(token: string): Promise<PublicUser | undefined> {
  const collection = await sessions();
  const session = await collection.findOne({ tokenHash: hashSecret(token) });
  if (!session) {
    return undefined;
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await collection.deleteOne({ _id: session._id });
    return undefined;
  }
  const user = await findUserById(session.userId);
  return user && isActiveAccount(user) ? toPublicUser(user) : undefined;
}

function toPublicToken(row: ApiTokenDoc) {
  return {
    workspaceId: row.workspaceId,
    id: row._id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes as ApiTokenScope[],
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
  };
}

export async function listTokens(userId: string) {
  const rows = await (await apiTokens())
    .find({ userId, revokedAt: null })
    .sort({ createdAt: -1 })
    .toArray();
  return rows.map(toPublicToken);
}

export async function issueApiToken(input: {
  userId: string;
  workspaceId: string;
  name: string;
  scopes: ApiTokenScope[];
  expiresAt: string | null;
}): Promise<{ token: string; record: Awaited<ReturnType<typeof listTokens>>[number] }> {
  await assertUserExists(input.userId);
  await getWorkspace(toPublicUser((await findUserById(input.userId))!), input.workspaceId);
  const token = generateApiToken();
  const id = randomId();
  const createdAt = nowIso();
  const prefix = publicTokenPrefix(token);
  const record = {
    _id: id,
    workspaceId: input.workspaceId,
    userId: input.userId,
    name: input.name,
    tokenHash: hashSecret(token),
    prefix,
    scopes: input.scopes,
    expiresAt: input.expiresAt,
    lastUsedAt: null,
    revokedAt: null,
    createdAt,
  };
  await (await apiTokens()).insertOne(record);
  return { token, record: toPublicToken(record) };
}

export async function revokeApiToken(userId: string, tokenId: string): Promise<boolean> {
  const result = await (
    await apiTokens()
  ).updateOne(
    { _id: tokenId, userId, revokedAt: null },
    { $set: { revokedAt: nowIso() } },
  );
  return result.matchedCount === 1;
}

async function tokenAuth(token: string): Promise<AuthContext | undefined> {
  if (!isApiTokenFormat(token)) {
    return undefined;
  }
  const collection = await apiTokens();
  const row = await collection.findOne({ tokenHash: hashSecret(token), revokedAt: null });
  if (!row) {
    return undefined;
  }
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) {
    return undefined;
  }
  const presented = hashSecret(token);
  if (!safeEqualHex(presented, row.tokenHash)) {
    return undefined;
  }
  const user = await findUserById(row.userId);
  if (!user || !isActiveAccount(user)) {
    return undefined;
  }
  await collection.updateOne({ _id: row._id }, { $set: { lastUsedAt: nowIso() } });
  return {
    user: toPublicUser(user),
    scopes: row.scopes as ApiTokenScope[],
    via: "token",
    tokenId: row._id,
    workspaceId: row.workspaceId,
  };
}

export async function resolveAuth(request: Request): Promise<AuthContext | undefined> {
  const token = bearerToken(request);
  if (token) {
    return tokenAuth(token);
  }
  const cookies = parseCookies(request.headers.get("cookie"));
  const sessionToken = cookies[SESSION_COOKIE];
  if (!sessionToken) {
    return undefined;
  }
  const user = await sessionUser(sessionToken);
  if (!user) {
    return undefined;
  }
  return {
    user,
    scopes: ["read", "write", "mcp"],
    via: "session",
  };
}

export async function updateUser(
  userId: string,
  patch: { name?: string; password?: string },
): Promise<PublicUser> {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }
  const name = patch.name?.trim() || user.name;
  let passwordHash = user.passwordHash;
  if (patch.password) {
    passwordHash = await hashPassword(patch.password);
  }
  await (await users()).updateOne({ _id: userId }, { $set: { name, passwordHash } });
  return { ...toPublicUser(user), name };
}

export function getSecret(): string {
  return getEnv().secret;
}
