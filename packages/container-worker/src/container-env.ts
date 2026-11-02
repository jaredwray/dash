/** Port the Nitro server listens on inside the container. */
export const CONTAINER_PORT = 3000;

/** One named instance so every request shares the dev SQLite file while it is awake. */
export const DEV_INSTANCE = "dev";

/**
 * Header `@cloudflare/containers` `switchPort` sets. Pinning it here keeps the
 * helper importable from Node tests; the package entry also loads `cloudflare:workers`.
 */
const CONTAINER_PORT_HEADER = "cf-container-target-port";

/** Force the container port so a client cannot choose a different one. */
export function forwardToContainer(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.set(CONTAINER_PORT_HEADER, String(CONTAINER_PORT));
  return new Request(request, { headers });
}

const PLACEHOLDER_SECRET = "change-me-in-production";

export function secretConfigured(secret: string | undefined): boolean {
  const value = secret?.trim();
  return Boolean(value && value !== PLACEHOLDER_SECRET);
}

/**
 * Environment passed into the container on start.
 * Demo seed stays off unless the Worker var is the string "true", so the public
 * dev host does not boot with the published admin password.
 */
export function containerEnv(env: {
  DASH_SECRET?: string;
  DASH_SEED_DEMO?: string;
}): Record<string, string> {
  const seedDemo = env.DASH_SEED_DEMO?.trim().toLowerCase() === "true";
  return {
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PORT: String(CONTAINER_PORT),
    NITRO_HOST: "0.0.0.0",
    NITRO_PORT: String(CONTAINER_PORT),
    DASH_DATABASE_PATH: "/data/dash.sqlite",
    ...(env.DASH_SECRET !== undefined ? { DASH_SECRET: env.DASH_SECRET } : {}),
    DASH_SEED_DEMO: seedDemo ? "true" : "false",
  };
}
