import { type Collection, type Db, MongoClient } from "mongodb";
import type { PlanId } from "~/content/plans";
import { cloudMongoUri } from "./env";

export type AccountDoc = {
  _id: string;
  /** Lowercase, with no surrounding spaces. A unique index enforces one account for each email. */
  email: string;
  name: string;
  passwordHash: string;
  organizationId: string;
  role: "owner";
  createdAt: Date;
};

export type OrganizationDoc = {
  _id: string;
  name: string;
  plan: PlanId;
  ownerAccountId: string;
  createdAt: Date;
};

export type SessionDoc = {
  _id: string;
  accountId: string;
  /** SHA-256 of the session token. The token itself is only in the cookie. */
  tokenHash: string;
  /** A TTL index deletes the session after this time. */
  expiresAt: Date;
  createdAt: Date;
};

export type LoginThrottleDoc = {
  /** The normalized email. */
  _id: string;
  failures: number;
  /** A TTL index deletes the record 15 minutes after this time. */
  windowStartedAt: Date;
};

/** How long the failed sign-in counter lives, in seconds. */
export const THROTTLE_WINDOW_SECONDS = 15 * 60;

type DbState = { uri: string; client: MongoClient; db: Promise<Db> };

// Next.js reloads modules in development. Keep one client for each process.
const cache = globalThis as typeof globalThis & { __dashCloudDb?: DbState };

async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection("accounts").createIndex({ email: 1 }, { unique: true, name: "accounts_email" }),
    db
      .collection("organizations")
      .createIndex({ ownerAccountId: 1 }, { name: "organizations_owner" }),
    db
      .collection("sessions")
      .createIndex({ tokenHash: 1 }, { unique: true, name: "sessions_token_hash" }),
    db
      .collection("sessions")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "sessions_expiry" }),
    db
      .collection("login_throttle")
      .createIndex(
        { windowStartedAt: 1 },
        { expireAfterSeconds: THROTTLE_WINDOW_SECONDS, name: "login_throttle_expiry" },
      ),
  ]);
}

/** Connects on the first call and creates the indexes. Later calls use the same client. */
export async function getDb(): Promise<Db> {
  const uri = cloudMongoUri();
  const current = cache.__dashCloudDb;
  if (current && current.uri === uri) return current.db;
  if (current) await current.client.close().catch(() => undefined);

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  const db = client.connect().then(async (connected) => {
    const database = connected.db();
    await ensureIndexes(database);
    return database;
  });
  const state: DbState = { uri, client, db };
  cache.__dashCloudDb = state;
  // A failed connection must not stay cached. The next request tries again.
  db.catch(() => {
    if (cache.__dashCloudDb === state) cache.__dashCloudDb = undefined;
  });
  return db;
}

/** Closes the client. Tests call this after they drop their database. */
export async function closeDb(): Promise<void> {
  const current = cache.__dashCloudDb;
  cache.__dashCloudDb = undefined;
  if (current) await current.client.close();
}

export const accounts = (db: Db): Collection<AccountDoc> => db.collection<AccountDoc>("accounts");
export const organizations = (db: Db): Collection<OrganizationDoc> =>
  db.collection<OrganizationDoc>("organizations");
export const sessions = (db: Db): Collection<SessionDoc> => db.collection<SessionDoc>("sessions");
export const loginThrottle = (db: Db): Collection<LoginThrottleDoc> =>
  db.collection<LoginThrottleDoc>("login_throttle");
