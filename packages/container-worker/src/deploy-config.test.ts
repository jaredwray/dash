import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

/** wrangler.jsonc is JSON plus comments. Strings in this file do not contain comment markers. */
function parseJsonc(text: string): unknown {
  const withoutBlocks = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLines = withoutBlocks.replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(withoutLines);
}

describe("dev.dash.io deploy config", () => {
  it("routes the Worker at dev.dash.io to one container", () => {
    const config = parseJsonc(readRepo("wrangler.jsonc")) as {
      name: string;
      main: string;
      workers_dev: boolean;
      routes: Array<{ pattern: string; custom_domain: boolean }>;
      containers: Array<{ class_name: string; image: string; max_instances: number; instance_type: string }>;
      durable_objects: { bindings: Array<{ name: string; class_name: string }> };
      exports: Record<string, { type: string; storage: string }>;
      vars: { DASH_SEED_DEMO: string };
      secrets?: { required: string[] };
      compatibility_date: string;
    };

    expect(config.name).toBe("dash-development");
    expect(config.main).toBe("packages/container-worker/src/index.ts");
    expect(config.workers_dev).toBe(false);
    expect(config.routes).toEqual([{ pattern: "dev.dash.io", custom_domain: true }]);
    expect(config.containers).toEqual([
      {
        class_name: "DashContainer",
        image: "./Dockerfile",
        max_instances: 1,
        instance_type: "basic",
        rollout_step_percentage: 100,
      },
    ]);
    expect(config.durable_objects.bindings).toEqual([
      { name: "DASH_CONTAINER", class_name: "DashContainer" },
    ]);
    expect(config.exports.DashContainer).toEqual({
      type: "durable-object",
      storage: "sqlite",
    });
    expect(config.vars.DASH_SEED_DEMO).toBe("false");
    expect(config.secrets).toBeUndefined();
    expect(config.compatibility_date).toBe("2026-10-19");
  });

  it("builds the web server into a container that listens on port 3000", () => {
    const dockerfile = readRepo("Dockerfile");
    expect(dockerfile).toContain("EXPOSE 3000");
    expect(dockerfile).toContain('CMD ["node", ".output/server/index.mjs"]');
    expect(dockerfile).toContain("DASH_SEED_DEMO=false");
    expect(dockerfile).toContain("pnpm --filter @dash/web build");
    expect(dockerfile).toContain("@sha256:");
  });

  it("deploys with the repo's wrangler on pushes to main", () => {
    const workflow = readRepo(".github/workflows/deploy-dev.yml");
    expect(workflow).toContain("name: deploy-dev");
    expect(workflow).toContain("pnpm exec wrangler deploy");
    expect(workflow).not.toContain("DASH_SECRET");
    expect(workflow).not.toContain("--secrets-file");
    expect(workflow).not.toContain("pull_request");
    expect(workflow).toContain("package-manager-cache: false");
    expect(workflow).toContain("group: deploy-dev");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("sfw pnpm install --frozen-lockfile");
  });
});
