import { randomBytes } from "node:crypto";
import { closeDb, getDb } from "./db";

/**
 * Points Dash Cloud at a new database on the shared MongoDB test cluster
 * (`pnpm test:services:start`). Call `dropTestDatabase` after each test.
 */
export function useTestDatabase(): void {
  const host = process.env.DASH_TEST_MONGODB_HOST ?? "127.0.0.1";
  const port = process.env.DASH_TEST_MONGODB_PORT ?? "27029";
  const user = encodeURIComponent(process.env.DASH_TEST_MONGODB_USER ?? "dash");
  const password = encodeURIComponent(process.env.DASH_TEST_MONGODB_PASSWORD ?? "dash");
  const authSource = encodeURIComponent(process.env.DASH_TEST_MONGODB_AUTH_SOURCE ?? "admin");
  const name = `dash_cloud_${randomBytes(4).toString("hex")}`;
  process.env.DASH_CLOUD_MONGODB_URI = `mongodb://${user}:${password}@${host}:${port}/${name}?authSource=${authSource}`;
}

export async function dropTestDatabase(): Promise<void> {
  await (await getDb()).dropDatabase();
  await closeDb();
  delete process.env.DASH_CLOUD_MONGODB_URI;
}
