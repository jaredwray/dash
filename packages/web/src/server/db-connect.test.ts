import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";
import { closeDb, getDb } from "./db.ts";
import { resetSeedForTests } from "./seed.ts";

function endpoint() {
  return {
    host: process.env.DASH_TEST_MONGODB_HOST ?? "127.0.0.1",
    port: process.env.DASH_TEST_MONGODB_PORT ?? "27029",
    user: process.env.DASH_TEST_MONGODB_USER ?? "dash",
    password: process.env.DASH_TEST_MONGODB_PASSWORD ?? "dash",
    authSource: process.env.DASH_TEST_MONGODB_AUTH_SOURCE ?? "admin",
  };
}

function adminUri(): string {
  const { host, port, user, password, authSource } = endpoint();
  return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/admin?authSource=${encodeURIComponent(authSource)}`;
}

describe("Atlas SCRAM connection", () => {
  const created: Array<{ user: string; database: string }> = [];
  let admin: MongoClient | undefined;

  afterEach(async () => {
    await closeDb();
    resetSeedForTests();
    if (admin) {
      for (const entry of created.splice(0)) {
        await admin.db(entry.database).dropDatabase().catch(() => undefined);
        await admin.db("admin").command({ dropUser: entry.user }).catch(() => undefined);
      }
      await admin.close();
      admin = undefined;
    }
  });

  async function asRole(role: "dbAdmin" | "readWrite"): Promise<{ user: string; database: string; uri: string }> {
    const { host, port } = endpoint();
    const suffix = randomBytes(4).toString("hex");
    const user = `atlas_${role.toLowerCase()}_${suffix}`;
    const database = `atlas_${suffix}`;
    const password = "atlas-pass";
    admin = new MongoClient(adminUri(), { serverSelectionTimeoutMS: 5_000 });
    await admin.connect();
    await admin.db("admin").command({
      createUser: user,
      pwd: password,
      roles: [{ role, db: database }],
    });
    created.push({ user, database });
    const uri = `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
    process.env.MONGODB_URI = uri;
    process.env.DASH_SECRET = "unit-test-secret";
    process.env.DASH_SEED_DEMO = "false";
    delete process.env.NODE_ENV;
    await closeDb();
    resetSeedForTests();
    return { user, database, uri };
  }

  it("creates the database for a dbAdmin user and reports that writes need readWrite", async () => {
    const { database, uri } = await asRole("dbAdmin");
    expect(uri).not.toContain("authSource");

    await expect(getDb()).rejects.toThrow(/readWrite role/);

    const names = (await admin!.db().admin().listDatabases()).databases.map((entry) => entry.name);
    expect(names).toContain(database);
  });

  it("connects a readWrite user when the URI omits authSource", async () => {
    const { database } = await asRole("readWrite");

    const db = await getDb();
    expect(db.databaseName).toBe(database);
    const settings = db.collection<{ _id: string; name: string; allowRegistration: boolean }>(
      "settings",
    );
    await settings.insertOne({ _id: "organization", name: "Dash", allowRegistration: true });
    expect(await settings.countDocuments({ _id: "organization" })).toBe(1);
  });
});
