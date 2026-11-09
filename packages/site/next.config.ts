import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The site has no server code. `next build` writes static HTML to `out/`.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
