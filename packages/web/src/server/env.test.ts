import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getEnv, migrateLegacySqlite } from "./env.ts";

describe("migrateLegacySqlite", () => {
  it("moves a legacy database and its sidecars when the new file is absent", () => {
    const root = mkdtempSync(join(tmpdir(), "dash-env-"));
    const legacy = join(root, "core/data/dash.sqlite");
    const target = join(root, "packages/web/data/dash.sqlite");
    mkdirSync(join(root, "core/data"), { recursive: true });
    writeFileSync(legacy, "sqlite-bytes");
    writeFileSync(`${legacy}-wal`, "wal");
    writeFileSync(`${legacy}-shm`, "shm");

    expect(migrateLegacySqlite(target, legacy)).toBe(true);
    expect(readFileSync(target, "utf8")).toBe("sqlite-bytes");
    expect(readFileSync(`${target}-wal`, "utf8")).toBe("wal");
    expect(readFileSync(`${target}-shm`, "utf8")).toBe("shm");
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(`${legacy}-wal`)).toBe(false);
  });

  it("leaves an existing database in place", () => {
    const root = mkdtempSync(join(tmpdir(), "dash-env-"));
    const legacy = join(root, "core/data/dash.sqlite");
    const target = join(root, "packages/web/data/dash.sqlite");
    mkdirSync(join(root, "core/data"), { recursive: true });
    mkdirSync(join(root, "packages/web/data"), { recursive: true });
    writeFileSync(legacy, "legacy");
    writeFileSync(target, "current");

    expect(migrateLegacySqlite(target, legacy)).toBe(false);
    expect(readFileSync(target, "utf8")).toBe("current");
    expect(readFileSync(legacy, "utf8")).toBe("legacy");
  });
});

describe("getEnv database path", () => {
  const previousCwd = process.cwd();
  const previousPath = process.env.DASH_DATABASE_PATH;

  afterEach(() => {
    process.chdir(previousCwd);
    if (previousPath === undefined) delete process.env.DASH_DATABASE_PATH;
    else process.env.DASH_DATABASE_PATH = previousPath;
  });

  it("moves core/data/dash.sqlite when the shipped relative path is in use", () => {
    const root = mkdtempSync(join(tmpdir(), "dash-env-"));
    const web = join(root, "packages/web");
    mkdirSync(web, { recursive: true });
    mkdirSync(join(root, "core/data"), { recursive: true });
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    writeFileSync(join(root, "core/data/dash.sqlite"), "legacy");
    process.chdir(web);
    process.env.DASH_DATABASE_PATH = "./data/dash.sqlite";

    const env = getEnv();

    expect(env.databasePath).toBe(join(web, "data/dash.sqlite"));
    expect(readFileSync(env.databasePath, "utf8")).toBe("legacy");
    expect(existsSync(join(root, "core/data/dash.sqlite"))).toBe(false);
  });

  it("does not import the legacy database into a custom path", () => {
    const root = mkdtempSync(join(tmpdir(), "dash-env-"));
    const web = join(root, "packages/web");
    const custom = join(root, "custom/dash.sqlite");
    mkdirSync(web, { recursive: true });
    mkdirSync(join(root, "core/data"), { recursive: true });
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    writeFileSync(join(root, "core/data/dash.sqlite"), "legacy");
    process.chdir(web);
    process.env.DASH_DATABASE_PATH = custom;

    const env = getEnv();

    expect(env.databasePath).toBe(custom);
    expect(existsSync(custom)).toBe(false);
    expect(readFileSync(join(root, "core/data/dash.sqlite"), "utf8")).toBe("legacy");
  });
});
