import { Container, getContainer, type StopParams } from "@cloudflare/containers";
import { CONTAINER_PORT, DEV_INSTANCE, forwardToContainer } from "./container-env.ts";
import { containerStartLog, writeLog } from "./logs.ts";
import { siteContainerEnv, siteStopLog, withNoIndex } from "./site-env.ts";

export interface Env {
  SITE_CONTAINER: DurableObjectNamespace<SiteContainer>;
  DASH_CLOUD_MONGODB_URI?: string;
}

/** Runs the Next.js server of `@dash/site`. See ADR 0013. */
export class SiteContainer extends Container<Env> {
  override defaultPort = CONTAINER_PORT;
  override sleepAfter = "1h";

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.envVars = siteContainerEnv(env);
  }

  override onStart(): void {
    writeLog(containerStartLog());
  }

  override onStop(params: StopParams): void {
    writeLog(siteStopLog(params));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await getContainer(env.SITE_CONTAINER, DEV_INSTANCE).fetch(
      forwardToContainer(request),
    );
    return withNoIndex(response);
  },
};
