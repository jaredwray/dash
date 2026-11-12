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

describe("demo.dash.io deploy config", () => {
  it("routes the Worker at demo.dash.io to one container", () => {
    const config = parseJsonc(readRepo("wrangler.jsonc")) as {
      name: string;
      main: string;
      workers_dev: boolean;
      routes: Array<{ pattern: string; custom_domain: boolean }>;
      containers: Array<{
        class_name: string;
        image: string;
        max_instances: number;
        instance_type: string;
        observability?: unknown;
      }>;
      observability?: unknown;
      durable_objects: { bindings: Array<{ name: string; class_name: string }> };
      exports: Record<string, { type: string; storage: string }>;
      vars: { DASH_SEED_DEMO: string };
      secrets?: { required: string[] };
      compatibility_date: string;
    };

    expect(config.name).toBe("dash-development");
    expect(config.main).toBe("packages/container-worker/src/index.ts");
    expect(config.workers_dev).toBe(false);
    expect(config.routes).toEqual([{ pattern: "demo.dash.io", custom_domain: true }]);
    expect(config.containers).toEqual([
      {
        class_name: "DashContainer",
        image: "./Dockerfile",
        max_instances: 1,
        instance_type: "basic",
        rollout_step_percentage: 100,
        observability: { logs: { enabled: true } },
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

  it("turns on Workers Logs for the Worker and logs for the container", () => {
    const config = parseJsonc(readRepo("wrangler.jsonc")) as {
      observability?: unknown;
      containers: Array<{ observability?: unknown }>;
    };

    expect(config.observability).toEqual({
      enabled: true,
      logs: { enabled: true, invocation_logs: true },
    });
    for (const container of config.containers) {
      expect(container.observability).toEqual({ logs: { enabled: true } });
    }
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
    const workflow = readRepo(".github/workflows/deploy-demo.yml");
    expect(workflow).toContain("name: deploy-demo");
    expect(workflow).toMatch(/pnpm exec wrangler deploy$/m);
    expect(workflow).not.toContain("DASH_SECRET");
    expect(workflow).not.toContain("MONGODB_URI");
    expect(workflow).not.toContain("--secrets-file");
    expect(workflow).not.toContain("pull_request");
    expect(workflow).toContain("package-manager-cache: false");
    expect(workflow).toContain("group: deploy-demo");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("sfw pnpm install --frozen-lockfile");
  });
});

describe("dev.dash.io deploy config", () => {
  it("routes the website Worker at dev.dash.io to one container", () => {
    const config = parseJsonc(readRepo("wrangler.site.jsonc")) as {
      name: string;
      main: string;
      workers_dev: boolean;
      routes: Array<{ pattern: string; custom_domain: boolean }>;
      containers: Array<{ class_name: string; image: string; max_instances: number }>;
      durable_objects: { bindings: Array<{ name: string; class_name: string }> };
      exports: Record<string, { type: string; storage: string }>;
      vars?: unknown;
    };

    // The app Worker keeps its name, so the two deploys cannot replace each other.
    expect(config.name).toBe("dash-site-development");
    expect(config.main).toBe("packages/container-worker/src/site.ts");
    expect(config.workers_dev).toBe(false);
    expect(config.routes).toEqual([{ pattern: "dev.dash.io", custom_domain: true }]);
    expect(config.containers).toMatchObject([
      { class_name: "SiteContainer", image: "./Dockerfile.site", max_instances: 1 },
    ]);
    expect(config.durable_objects.bindings).toEqual([
      { name: "SITE_CONTAINER", class_name: "SiteContainer" },
    ]);
    expect(config.exports.SiteContainer).toEqual({ type: "durable-object", storage: "sqlite" });
    // The database URI is a Worker secret. It must not be a plain var in this file.
    expect(config.vars).toBeUndefined();

    const worker = readRepo(config.main);
    expect(worker).toContain("export class SiteContainer ");
    expect(worker).toContain("env.SITE_CONTAINER");
  });

  it("builds the website into a container that runs the standalone server on port 3000", () => {
    const dockerfile = readRepo("Dockerfile.site");
    expect(dockerfile).toContain("pnpm --filter @dash/site build");
    expect(dockerfile).toContain("EXPOSE 3000");
    expect(dockerfile).toContain('CMD ["node", "packages/site/server.js"]');
    // The standalone server does not include these directories.
    expect(dockerfile).toContain("/app/packages/site/.next/static ./packages/site/.next/static");
    expect(dockerfile).toContain("/app/packages/site/public ./packages/site/public");
    expect(dockerfile).toContain("@sha256:");
    // `next build` writes the standalone server only when this variable is set.
    expect(dockerfile).toContain("DASH_SITE_OUTPUT=standalone");
    expect(readRepo("packages/site/next.config.ts")).toContain(
      'process.env.DASH_SITE_OUTPUT === "standalone"',
    );
    expect(readRepo(".dockerignore")).toContain("**/.next");
  });

  it("deploys the website with its own Wrangler config on pushes to main", () => {
    const workflow = readRepo(".github/workflows/deploy-dev.yml");
    expect(workflow).toContain("name: deploy-dev");
    expect(workflow).toContain("pnpm exec wrangler deploy --config wrangler.site.jsonc");
    expect(workflow).not.toContain("MONGODB_URI");
    expect(workflow).not.toContain("pull_request");
    expect(workflow).toContain("group: deploy-dev");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("sfw pnpm install --frozen-lockfile");
  });
});
