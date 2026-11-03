import { randomBytes } from "node:crypto";
import { closeDb, dropDb } from "./db.ts";
import { resetSeedForTests } from "./seed.ts";

/** Isolated database on the shared adapter-test MongoDB cluster. */
export function uniqueAppMongoUri(): string {
  const host = process.env.DASH_TEST_MONGODB_HOST ?? "127.0.0.1";
  const port = process.env.DASH_TEST_MONGODB_PORT ?? "27029";
  const user = process.env.DASH_TEST_MONGODB_USER ?? "dash";
  const password = process.env.DASH_TEST_MONGODB_PASSWORD ?? "dash";
  const authSource = process.env.DASH_TEST_MONGODB_AUTH_SOURCE ?? "admin";
  const name = `dash_app_${randomBytes(4).toString("hex")}`;
  return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}?authSource=${encodeURIComponent(authSource)}`;
}

export async function useFreshAppDatabase(): Promise<void> {
  await closeDb();
  resetSeedForTests();
  process.env.DASH_SECRET = "unit-test-secret";
  process.env.DASH_SEED_DEMO = "false";
  delete process.env.DASH_DATABASE_PATH;
  process.env.MONGODB_URI = uniqueAppMongoUri();
}

export async function destroyAppDatabase(): Promise<void> {
  await dropDb();
  await closeDb();
  resetSeedForTests();
}
