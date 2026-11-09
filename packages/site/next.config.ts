import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dash Cloud sign-up and sign-in use server actions, so the site runs as a Node.js server.
  // The marketing pages are still static. See ADR 0012.
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
