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

/**
 * Sign-in attempts for one email in a 15-minute window. A correct sign-in resets the count,
 * so in practice this is the number of failures in a row.
 */
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

/**
 * Reserves one sign-in attempt for the email before the password check.
 * Each reservation is one conditional update, so concurrent requests cannot pass the limit.
 * Returns false when the window has no attempts left.
 */
async function reserveAttempt(email: string): Promise<boolean> {
  const collection = loginThrottle(await getDb());
  const windowStart = new Date(Date.now() - THROTTLE_WINDOW_SECONDS * 1000);
  // The TTL monitor runs once a minute, so remove an old window here.
  await collection.deleteOne({ _id: email, windowStartedAt: { $lte: windowStart } });

  const open = { _id: email, attempts: { $lt: MAX_FAILED_SIGN_INS } };
  try {
    await collection.updateOne(
      open,
      { $inc: { attempts: 1 }, $setOnInsert: { windowStartedAt: new Date() } },
      { upsert: true },
    );
    return true;
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }
  // The upsert failed on the _id, so the record exists. Either it is full, or a concurrent
  // request created it first. Try once more with no upsert.
  const retry = await collection.updateOne(open, { $inc: { attempts: 1 } });
  return retry.modifiedCount === 1;
}

/**
 * Returns the account id when the email and password match, or null when they do not.
 * Throws TooManyAttemptsError when the email has no attempts left in the window.
 */
export async function verifyCredentials(email: string, password: string): Promise<string | null> {
  const db = await getDb();
  const key = normalizeEmail(email);
  if (!(await reserveAttempt(key))) throw new TooManyAttemptsError();

  const account = await accounts(db).findOne({ email: key });
  dummyHash ??= hashPassword(newId());
  const matches = await verifyPassword(password, account?.passwordHash ?? (await dummyHash));
  if (!account || !matches) return null;

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
