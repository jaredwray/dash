import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { adapters } from "./adapters";
import { mcpTools } from "./mcp";

// The website must name each shipped adapter and MCP tool, and nothing that does not ship.
const packagesDir = resolve(import.meta.dirname, "../../..");

test("the adapter list matches the adapter packages in the monorepo", () => {
  const shipped = readdirSync(packagesDir)
    .filter((dir) => dir.endsWith("-adapter"))
    .map((dir) => {
      const manifest = JSON.parse(readFileSync(resolve(packagesDir, dir, "package.json"), "utf8"));
      return String(manifest.name).replace(/^@dash\/adapter-/, "");
    })
    .sort();

  expect(shipped.length).toBeGreaterThan(0);
  expect(adapters.map((adapter) => adapter.id).sort()).toEqual(shipped);
});

test("the MCP tool list matches the tools that the app registers", () => {
  const source = readFileSync(resolve(packagesDir, "web/src/server/mcp.ts"), "utf8");
  const registered = [...source.matchAll(/registerTool\(\s*"([a-z_]+)"/g)]
    .map((match) => match[1])
    .sort();

  expect(registered.length).toBeGreaterThan(0);
  expect(mcpTools.map((tool) => tool.name).sort()).toEqual(registered);
});
