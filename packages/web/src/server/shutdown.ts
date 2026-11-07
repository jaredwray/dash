/**
 * Time that Node gets to exit by itself after the close hook starts. After this
 * time, the process stops with exit code 1.
 */
export const FORCED_EXIT_MS = 10_000;

type Closer = () => Promise<void>;

interface ShutdownState {
  closing: boolean;
  closers: Set<Closer>;
}

const STATE = Symbol.for("dash.server.shutdown");

/**
 * The shutdown state is on `globalThis`. Nitro bundles its plugins apart from
 * the TanStack Start routes, so each bundle gets its own copy of this module.
 * Only the route copy of `db.ts` holds the live client.
 */
function state(): ShutdownState {
  const store = globalThis as typeof globalThis & { [STATE]?: ShutdownState };
  store[STATE] ??= { closing: false, closers: new Set() };
  return store[STATE];
}

/** The error for a request that tries to open a client after shutdown starts. */
export class ServerClosingError extends Error {
  constructor() {
    super("The server is shutting down");
    this.name = "ServerClosingError";
  }
}

/**
 * True after shutdown starts. A forced close destroys the sockets but does not
 * stop handlers that are still running. Code that opens a client must check
 * this value, so that no new socket opens after the closers run.
 */
export function isServerClosing(): boolean {
  return state().closing;
}

/** Register a function that releases sockets or timers when the server stops. */
export function onServerClose(closer: Closer): void {
  state().closers.add(closer);
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
  const current = state();
  current.closing = true;
  const results = await Promise.allSettled([...current.closers].map((close) => close()));
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
