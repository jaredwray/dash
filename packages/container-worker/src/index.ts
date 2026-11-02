import { Container, getContainer } from "@cloudflare/containers";
import { CONTAINER_PORT, DEV_INSTANCE, containerEnv, secretConfigured } from "./container-env.ts";

export interface Env {
  DASH_CONTAINER: DurableObjectNamespace<DashContainer>;
  DASH_SECRET: string;
  DASH_SEED_DEMO?: string;
}

export class DashContainer extends Container<Env> {
  override defaultPort = CONTAINER_PORT;
  override sleepAfter = "1h";

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.envVars = containerEnv(env);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!secretConfigured(env.DASH_SECRET)) {
      return new Response("DASH_SECRET is not configured", { status: 500 });
    }
    return getContainer(env.DASH_CONTAINER, DEV_INSTANCE).fetch(request);
  },
};
