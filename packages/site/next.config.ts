import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  // The image for dev.dash.io builds with DASH_SITE_OUTPUT=standalone. `next build` then also
  // writes `.next/standalone/`, a server with only the files that it needs. See ADR 0013.
  output: process.env.DASH_SITE_OUTPUT === "standalone" ? "standalone" : undefined,
  // pnpm keeps the dependencies in the repo root, so the file trace starts there.
  outputFileTracingRoot: repoRoot,
  // Dash Cloud sign-up and sign-in use server actions, so the site runs as a Node.js server.
  // The marketing pages are still static. See ADR 0012.
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
