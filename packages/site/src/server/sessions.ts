import { type AccountWithOrganization, findAccount } from "./accounts";
import { hashToken, newId, newToken } from "./crypto";
import { getDb, sessions } from "./db";

export const SESSION_COOKIE = "dash_cloud_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Creates a session and returns the token for the cookie. Only the token hash is stored. */
export async function createSession(
  accountId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await sessions(await getDb()).insertOne({
    _id: newId(),
    accountId,
    tokenHash: hashToken(token),
    expiresAt,
    createdAt: now,
  });
  return { token, expiresAt };
}

/** Returns the signed-in account for a token, or null for an unknown or expired session. */
export async function findSessionAccount(token: string): Promise<AccountWithOrganization | null> {
  const session = await sessions(await getDb()).findOne({
    tokenHash: hashToken(token),
    // The TTL monitor runs once a minute, so check the expiry here too.
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;
  return findAccount(session.accountId);
}

export async function deleteSession(token: string): Promise<void> {
  await sessions(await getDb()).deleteOne({ tokenHash: hashToken(token) });
}
