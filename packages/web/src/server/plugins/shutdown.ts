import { definePlugin } from "nitro";
import {
  FORCED_EXIT_MS,
  closeServerResources,
  exitIfStillRunningAfter,
} from "../shutdown.ts";

/** Nitro calls the `close` hook after the HTTP server stops on SIGTERM or SIGINT. */
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("close", async () => {
    exitIfStillRunningAfter(FORCED_EXIT_MS);
    await closeServerResources();
  });
});
