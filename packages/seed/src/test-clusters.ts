import { randomBytes } from "node:crypto";
import type { BigQueryConnectionConfig, MongoConnectionConfig, PostgresConnectionConfig } from "@dash/core";

/** Cluster settings for writer tests. The defaults match docker-compose.test.yml. */

function port(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid ${name}: ${process.env[name]}`);
  return value;
}

export function uniqueName(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

export function postgresConfig(database: string): PostgresConnectionConfig {
  return {
    kind: "postgres",
    host: process.env.DASH_TEST_POSTGRES_HOST ?? "127.0.0.1",
    port: port("DASH_TEST_POSTGRES_PORT", 54329),
    database,
    user: process.env.DASH_TEST_POSTGRES_USER ?? "dash",
    password: process.env.DASH_TEST_POSTGRES_PASSWORD ?? "dash",
  };
}

export const POSTGRES_ADMIN_DATABASE = process.env.DASH_TEST_POSTGRES_DATABASE ?? "dash";

export function mongoConfig(database: string): MongoConnectionConfig {
  return {
    kind: "mongodb",
    host: process.env.DASH_TEST_MONGODB_HOST ?? "127.0.0.1",
    port: port("DASH_TEST_MONGODB_PORT", 27029),
    database,
    user: process.env.DASH_TEST_MONGODB_USER ?? "dash",
    password: process.env.DASH_TEST_MONGODB_PASSWORD ?? "dash",
    authSource: process.env.DASH_TEST_MONGODB_AUTH_SOURCE ?? "admin",
  };
}

export function bigQueryConfig(): BigQueryConnectionConfig {
  return {
    kind: "bigquery",
    projectId: process.env.DASH_TEST_BIGQUERY_PROJECT ?? "dash",
    apiEndpoint: `http://${process.env.DASH_TEST_BIGQUERY_HOST ?? "127.0.0.1"}:${port("DASH_TEST_BIGQUERY_PORT", 9059)}`,
  };
}

export const NOT_READY = (engine: string) =>
  `${engine} test cluster is not ready. Start it with \`pnpm test:services:start\`.`;
