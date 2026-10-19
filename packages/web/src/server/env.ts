import { copyFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";

const LEGACY_DATABASE = "core/data/dash.sqlite";

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

/** True when the database path is the shipped default, relative to the web package. */
export function usesPackageRelativeDatabase(configured: string | undefined): boolean {
  const value = configured?.trim();
  return !value || value === "./data/dash.sqlite" || value === "data/dash.sqlite";
}

export function findRepoRoot(start: string): string | undefined {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function moveFile(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    copyFileSync(from, to);
    unlinkSync(from);
  }
}

/**
 * Move a database created when `@dash/web` lived in `core/` to the current path.
 * Leaves an existing target file in place.
 */
export function migrateLegacySqlite(targetPath: string, legacyPath: string): boolean {
  if (resolve(targetPath) === resolve(legacyPath) || isFile(targetPath) || !isFile(legacyPath)) {
    return false;
  }
  mkdirSync(dirname(targetPath), { recursive: true });
  moveFile(legacyPath, targetPath);
  for (const suffix of ["-wal", "-shm"]) {
    const from = `${legacyPath}${suffix}`;
    if (isFile(from)) moveFile(from, `${targetPath}${suffix}`);
  }
  return true;
}

export function getEnv() {
  const configured = process.env.DASH_DATABASE_PATH;
  const databasePath = resolve(configured ?? resolve(process.cwd(), "data/dash.sqlite"));
  if (usesPackageRelativeDatabase(configured)) {
    const root = findRepoRoot(process.cwd());
    if (root) migrateLegacySqlite(databasePath, resolve(root, LEGACY_DATABASE));
  }
  mkdirSync(dirname(databasePath), { recursive: true });
  const seedDemo = (process.env.DASH_SEED_DEMO ?? "true").toLowerCase() !== "false";
  return {
    secret: requiredSecret(),
    databasePath,
    seedDemo,
    isProduction: process.env.NODE_ENV === "production",
  };
}
