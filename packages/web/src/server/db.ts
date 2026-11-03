import { randomBytes } from "node:crypto";
import type { DashboardWidget, PublicUser } from "@dash/core";
import { MongoClient, type Collection, type Db } from "mongodb";
import { getEnv } from "./env.ts";
import { explainDatabaseError } from "./mongo-error.ts";

export interface UserDoc {
  _id: string;
  email: string;
  name: string;
  role: PublicUser["role"];
  passwordHash: string;
  createdAt: string;
}

export interface SessionDoc {
  _id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface ApiTokenDoc {
  _id: string;
  userId: string;
  name: string;
  tokenHash: string;
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface SettingsDoc {
  _id: "organization";
  name: string;
  allowRegistration: boolean;
}

export interface DataSourceDoc {
  _id: string;
  name: string;
  kind: string;
  description: string;
  configEncrypted: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardDoc {
  _id: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

let client: MongoClient | undefined;
let database: Db | undefined;
let connectTask: Promise<Db> | undefined;

async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true, name: "users_email" }),
    db.collection("sessions").createIndex(
      { tokenHash: 1 },
      { unique: true, name: "sessions_token_hash" },
    ),
    db.collection("sessions").createIndex({ userId: 1 }, { name: "sessions_user" }),
    db.collection("api_tokens").createIndex(
      { tokenHash: 1 },
      { unique: true, name: "api_tokens_token_hash" },
    ),
    db.collection("api_tokens").createIndex({ userId: 1 }, { name: "api_tokens_user" }),
  ]);
}

let generation = 0;

/** Indexes create the database. A write probe rejects roles such as dbAdmin that cannot insert. */
async function assertWritable(db: Db): Promise<void> {
  const users = db.collection<{
    _id: string;
    email: string;
    name: string;
    role: string;
    passwordHash: string;
    createdAt: string;
  }>("users");
  const id = `dash-probe-${randomBytes(8).toString("hex")}`;
  let inserted = false;
  try {
    await users.insertOne({
      _id: id,
      email: `${id}@probe.invalid`,
      name: "probe",
      role: "member",
      passwordHash: "probe",
      createdAt: new Date().toISOString(),
    });
    inserted = true;
  } finally {
    if (inserted) {
      await users.deleteOne({ _id: id }).catch(() => undefined);
    }
  }
}

async function open(gen: number): Promise<Db> {
  const { mongoUri, databaseName, authSource } = getEnv();
  const next = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 5_000,
    appName: "dash",
    ...(authSource ? { authSource } : {}),
  });
  let published = false;
  try {
    await next.connect();
    const db = next.db(databaseName);
    await ensureIndexes(db);
    await assertWritable(db);
    if (generation !== gen) {
      throw new Error("Database connection closed");
    }
    client = next;
    database = db;
    if (generation !== gen) {
      client = undefined;
      database = undefined;
      throw new Error("Database connection closed");
    }
    published = true;
    return db;
  } catch (error) {
    if (!published) {
      await next.close().catch(() => undefined);
    }
    throw explainDatabaseError(error, databaseName);
  }
}

export function getDb(): Promise<Db> {
  if (database) {
    return Promise.resolve(database);
  }
  if (!connectTask) {
    const gen = generation;
    connectTask = open(gen).catch((error: unknown) => {
      if (generation === gen) {
        connectTask = undefined;
      }
      throw error;
    });
  }
  return connectTask;
}

/** Drop the current database. Used by tests so one cluster can host isolated app databases. */
export async function dropDb(): Promise<void> {
  if (!database) {
    return;
  }
  await database.dropDatabase();
}

export async function closeDb(): Promise<void> {
  generation += 1;
  const current = client;
  client = undefined;
  database = undefined;
  connectTask = undefined;
  await current?.close();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function users(): Promise<Collection<UserDoc>> {
  return (await getDb()).collection<UserDoc>("users");
}

export async function sessions(): Promise<Collection<SessionDoc>> {
  return (await getDb()).collection<SessionDoc>("sessions");
}

export async function apiTokens(): Promise<Collection<ApiTokenDoc>> {
  return (await getDb()).collection<ApiTokenDoc>("api_tokens");
}

export async function organizationSettings(): Promise<Collection<SettingsDoc>> {
  return (await getDb()).collection<SettingsDoc>("settings");
}

export async function dataSources(): Promise<Collection<DataSourceDoc>> {
  return (await getDb()).collection<DataSourceDoc>("data_sources");
}

export async function dashboards(): Promise<Collection<DashboardDoc>> {
  return (await getDb()).collection<DashboardDoc>("dashboards");
}
