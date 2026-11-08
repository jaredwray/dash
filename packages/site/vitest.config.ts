import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // `next build` sets this from `trailingSlash: true`. Links in tests then match the built HTML.
    env: { __NEXT_TRAILING_SLASH: "true" },
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
