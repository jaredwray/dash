import { MongoServerError } from "mongodb";
import { hashPassword, newId, verifyPassword } from "./crypto";
import {
  type AccountDoc,
  accounts,
  getDb,
  loginThrottle,
  type OrganizationDoc,
  organizations,
  THROTTLE_WINDOW_SECONDS,
} from "./db";

/** Failed sign-in attempts for one email before the window locks. */
export const MAX_FAILED_SIGN_INS = 10;

export class EmailTakenError extends Error {
  constructor() {
    super("An account with this email exists.");
    this.name = "EmailTakenError";
  }
}

export class TooManyAttemptsError extends Error {
  constructor() {
    super("Too many failed sign-in attempts.");
    this.name = "TooManyAttemptsError";
  }
}

export type NewAccount = {
  name: string;
  email: string;
  organization: string;
  password: string;
};

export type AccountWithOrganization = {
  account: Omit<AccountDoc, "passwordHash">;
  organization: OrganizationDoc;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const isDuplicateKey = (error: unknown): boolean =>
  error instanceof MongoServerError && error.code === 11000;

/**
 * Creates an account and its organization on the Cloud plan. The account is the owner.
 * Throws EmailTakenError when an account has the same email, in any letter case.
 */
export async function createAccount(input: NewAccount): Promise<{ accountId: string }> {
  const db = await getDb();
  const accountId = newId();
  const organizationId = newId();
  const createdAt = new Date();
  const passwordHash = await hashPassword(input.password);

  try {
    await accounts(db).insertOne({
      _id: accountId,
      email: normalizeEmail(input.email),
      name: input.name.trim(),
      passwordHash,
      organizationId,
      role: "owner",
      createdAt,
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw new EmailTakenError();
    throw error;
  }

  try {
    await organizations(db).insertOne({
      _id: organizationId,
      name: input.organization.trim(),
      plan: "cloud",
      ownerAccountId: accountId,
      createdAt,
    });
  } catch (error) {
    // MongoDB on a single node has no transactions. Remove the account so the email is free again.
    await accounts(db).deleteOne({ _id: accountId });
    throw error;
  }

  return { accountId };
}

// A hash to compare against when the email has no account, so both cases take the same time.
let dummyHash: Promise<string> | undefined;

async function recordFailure(email: string): Promise<void> {
  const collection = loginThrottle(await getDb());
  const windowStart = new Date(Date.now() - THROTTLE_WINDOW_SECONDS * 1000);
  // The TTL monitor runs once a minute, so remove an old window here.
  await collection.deleteOne({ _id: email, windowStartedAt: { $lte: windowStart } });
  const update = {
    $inc: { failures: 1 },
    $setOnInsert: { windowStartedAt: new Date() },
  };
  try {
    await collection.updateOne({ _id: email }, update, { upsert: true });
  } catch (error) {
    // Two concurrent upserts can race on the _id. The record exists now, so count again.
    if (!isDuplicateKey(error)) throw error;
    await collection.updateOne({ _id: email }, update);
  }
}

/**
 * Returns the account id when the email and password match, or null when they do not.
 * Throws TooManyAttemptsError after MAX_FAILED_SIGN_INS failures in the window.
 */
export async function verifyCredentials(email: string, password: string): Promise<string | null> {
  const db = await getDb();
  const key = normalizeEmail(email);
  const windowStart = new Date(Date.now() - THROTTLE_WINDOW_SECONDS * 1000);

  const throttle = await loginThrottle(db).findOne({
    _id: key,
    windowStartedAt: { $gt: windowStart },
  });
  if (throttle && throttle.failures >= MAX_FAILED_SIGN_INS) throw new TooManyAttemptsError();

  const account = await accounts(db).findOne({ email: key });
  dummyHash ??= hashPassword(newId());
  const matches = await verifyPassword(password, account?.passwordHash ?? (await dummyHash));
  if (!account || !matches) {
    await recordFailure(key);
    return null;
  }

  await loginThrottle(db).deleteOne({ _id: key });
  return account._id;
}

/** Returns the account and its organization, without the password hash. */
export async function findAccount(accountId: string): Promise<AccountWithOrganization | null> {
  const db = await getDb();
  const account = await accounts(db).findOne(
    { _id: accountId },
    { projection: { passwordHash: 0 } },
  );
  if (!account) return null;
  const organization = await organizations(db).findOne({ _id: account.organizationId });
  if (!organization) return null;
  return { account, organization };
}
