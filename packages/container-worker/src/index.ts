import { Container, getContainer } from "@cloudflare/containers";
import {
  CONTAINER_PORT,
  DEV_INSTANCE,
  containerBlockedReason,
  containerEnv,
  forwardToContainer,
} from "./container-env.ts";

export interface Env {
  DASH_CONTAINER: DurableObjectNamespace<DashContainer>;
  DASH_SECRET?: string;
  DASH_SEED_DEMO?: string;
  MONGODB_URI?: string;
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
    const blocked = containerBlockedReason(env);
    if (blocked) {
      return new Response(blocked, { status: 500 });
    }
    return getContainer(env.DASH_CONTAINER, DEV_INSTANCE).fetch(forwardToContainer(request));
  },
};
