import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

function requiredSecret(): string {
  const value = process.env.DASH_SECRET?.trim();
  if (value && value !== "change-me-in-production") {
    return value;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("DASH_SECRET must be set to a strong value in production");
  }
  return value || "dash-dev-secret";
}

export function getEnv() {
  const databasePath = resolve(
    process.env.DASH_DATABASE_PATH ?? resolve(process.cwd(), "data/dash.sqlite"),
  );
  mkdirSync(dirname(databasePath), { recursive: true });
  const seedDemo = (process.env.DASH_SEED_DEMO ?? "true").toLowerCase() !== "false";
  return {
    secret: requiredSecret(),
    databasePath,
    seedDemo,
    isProduction: process.env.NODE_ENV === "production",
  };
}
