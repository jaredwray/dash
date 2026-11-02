# ADR 0006: Dev deploys as a Worker in front of a container

## Status

Accepted

## Context

`@dash/web` is a TanStack Start server that runs on Node (`node .output/server/index.mjs`). It keeps users, sessions, and data-source credentials in a SQLite file. The dev host should be `dev.dash.io`, and the deploy should run from GitHub Actions with Wrangler.

Cloudflare Workers cannot run this Node server directly. Workers Containers can: a Worker receives the request and proxies it to a container built from the repo Dockerfile.

## Decision

- `wrangler` is a root dev dependency. `pnpm deploy:dev` and the `deploy-dev` workflow both run `wrangler deploy`. `pnpm deploy` is reserved by pnpm and does not run the script.
- The Worker is named `dash-development`. `wrangler.jsonc` attaches it to the custom domain `dev.dash.io` and turns `workers.dev` off.
- One container class, `DashContainer`, runs the production image. `max_instances` is 1 and every request uses the instance named `dev`, so a single SQLite file serves the host while that instance is awake.
- The instance type is `basic` (1 GiB memory). The container listens on port 3000.
- `DASH_SECRET` is a Worker secret, copied into the container environment when the instance starts. It is not baked into the image and it is not an Actions secret. `DASH_SEED_DEMO` defaults to false so the public host does not boot with the demo admin password.
- GitHub Actions workflow `deploy-dev` runs on pushes to `main` and on `workflow_dispatch`. It installs through Socket Firewall and deploys with the pinned Wrangler. Required Actions secrets are `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The first deploy creates the `dash-development` Worker without `DASH_SECRET`. The secret is added afterward with `wrangler secret put`. Wrangler does not delete an existing secret on later deploys.

## Consequences

Container disk is ephemeral. After the instance sleeps (one hour without a request) or a new image rolls out, SQLite state is gone and the next visitor registers again. The first registered user is the admin. Registration stays open while the database is empty, so each reset is a window where anyone who can reach `dev.dash.io` becomes admin and can store warehouse credentials. Outbound network stays enabled so those warehouses can be queried. Cloudflare Access on the hostname is the control for that window; this change does not add an application login gate. Moving app state into Durable Object storage would be a separate change.
