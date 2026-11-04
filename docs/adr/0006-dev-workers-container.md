# ADR 0006: Dev deploys as a Worker in front of a container

## Status

Accepted. App state no longer lives in a SQLite file on the container disk. See [ADR 0007](0007-mongodb-app-state.md).

## Context

`@dash/web` is a TanStack Start server that runs on Node (`node .output/server/index.mjs`). It keeps users, sessions, and data-source credentials in a SQLite file. The dev host should be `dev.dash.io`, and the deploy should run from GitHub Actions with Wrangler.

Cloudflare Workers cannot run this Node server directly. Workers Containers can: a Worker receives the request and proxies it to a container built from the repo Dockerfile.

## Decision

- `wrangler` is a root dev dependency. `pnpm deploy:dev` and the `deploy-dev` workflow both run `wrangler deploy`. `pnpm deploy` is reserved by pnpm and does not run the script.
- The Worker is named `dash-development`. `wrangler.jsonc` attaches it to the custom domain `dev.dash.io` and turns `workers.dev` off.
- One container class, `DashContainer`, runs the production image. `max_instances` is 1 and every request uses the instance named `dev`. App records live in MongoDB ([ADR 0007](0007-mongodb-app-state.md)), so the instance no longer owns that state.
- The instance type is `basic` (1 GiB memory). The container listens on port 3000.
- `DASH_SECRET` is a Worker secret, copied into the container environment when the instance starts. It is not baked into the image and it is not an Actions secret. `DASH_SEED_DEMO` defaults to false so the public host does not boot with the demo admin password.
- Cloudflare logging is on. The root `observability` block turns on Workers Logs with invocation logs for the Worker and its Durable Object. `containers[].observability.logs.enabled` turns on container logs, so the Node server's stdout and stderr are kept. The container setting is explicit rather than inherited from the root block. The Worker logs structured objects (`request blocked`, `container started`, `container stopped`, `container crashed`) and never logs secrets or the container environment.
- GitHub Actions workflow `deploy-dev` runs on pushes to `main` and on `workflow_dispatch`. It installs through Socket Firewall and deploys with the pinned Wrangler. Required Actions secrets are `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The first deploy creates the `dash-development` Worker without `DASH_SECRET`. The secret is added afterward with `wrangler secret put`. Wrangler does not delete an existing secret on later deploys.

## Consequences

Container disk is ephemeral, which is why app state moved to MongoDB ([ADR 0007](0007-mongodb-app-state.md)). Outbound network stays enabled so warehouses can be queried. Cloudflare Access on the hostname is still the control for who can reach the dev host. The Durable Object keeps Cloudflare's `sqlite` storage backend; that storage is not the application database.
