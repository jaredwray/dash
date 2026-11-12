import { CONTAINER_PORT } from "./container-env.ts";
import { type ContainerStop, type LogLine, containerStopLog } from "./logs.ts";

/**
 * Environment passed into the website container on start.
 * `DASH_CLOUD_MONGODB_URI` is a Worker secret. The marketing pages work without it,
 * so a missing secret does not block the request.
 */
export function siteContainerEnv(env: { DASH_CLOUD_MONGODB_URI?: string }): Record<string, string> {
  const mongoUri = env.DASH_CLOUD_MONGODB_URI?.trim();
  return {
    NODE_ENV: "production",
    HOSTNAME: "0.0.0.0",
    PORT: String(CONTAINER_PORT),
    ...(mongoUri ? { DASH_CLOUD_MONGODB_URI: mongoUri } : {}),
  };
}

/**
 * The development website is a copy of the public website.
 * This header tells search engines not to index the copy.
 */
export function withNoIndex(response: Response): Response {
  const copy = new Response(response.body, response);
  copy.headers.set("X-Robots-Tag", "noindex, nofollow");
  return copy;
}

/** Exit code of the Next.js server after SIGTERM (128 + 15). */
const SIGTERM_EXIT_CODE = 143;

/**
 * Cloudflare sends SIGTERM when the instance sleeps and when a new image rolls out.
 * Next.js then exits with code 143. That exit is a normal stop, not a crash.
 */
export function siteStopLog(stop: ContainerStop): LogLine {
  if (stop.exitCode === SIGTERM_EXIT_CODE) {
    return {
      level: "log",
      entry: { message: "container stopped", exitCode: stop.exitCode, reason: stop.reason },
    };
  }
  return containerStopLog(stop);
}
