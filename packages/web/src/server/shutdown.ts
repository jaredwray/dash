/**
 * Time that Node gets to exit by itself after the close hook starts. After this
 * time, the process stops with exit code 1.
 */
export const FORCED_EXIT_MS = 10_000;

type Closer = () => Promise<void>;

const CLOSERS = Symbol.for("dash.server.closers");

/**
 * The closer set is on `globalThis`. Nitro bundles its plugins apart from the
 * TanStack Start routes, so each bundle gets its own copy of this module. Only
 * the route copy of `db.ts` holds the live client.
 */
function closers(): Set<Closer> {
  const store = globalThis as typeof globalThis & { [CLOSERS]?: Set<Closer> };
  store[CLOSERS] ??= new Set();
  return store[CLOSERS];
}

/** Register a function that releases sockets or timers when the server stops. */
export function onServerClose(closer: Closer): void {
  closers().add(closer);
}

/**
 * Run each registered closer, for example for the app database client and for
 * cached data source adapters.
 *
 * On SIGTERM, srvx closes the HTTP listener and then lets Node exit when no
 * handle is open. An open MongoDB or warehouse socket keeps the process alive
 * with no listener. Cloudflare then sees a running container that refuses each
 * request, and the Worker logs "Error proxying request to container".
 */
export async function closeServerResources(): Promise<void> {
  const results = await Promise.allSettled([...closers()].map((close) => close()));
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[dash] shutdown: a client did not close:", result.reason);
    }
  }
}

/**
 * Stop the process if a handle that no closer releases keeps it alive. The
 * timer is unref'd, so it does not delay a clean exit.
 */
export function exitIfStillRunningAfter(ms: number): void {
  const timer = setTimeout(() => {
    console.error(
      `[dash] shutdown: the process did not exit ${ms} ms after the server closed; forcing exit`,
    );
    process.exit(1);
  }, ms);
  timer.unref();
}
