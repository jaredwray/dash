# ADR 0007: App state in MongoDB

## Status

Accepted. Supersedes the SQLite file in [ADR 0006](0006-dev-workers-container.md).

## Context

`@dash/web` stored users, sessions, API tokens, settings, data sources, and dashboards in a SQLite file. On `dev.dash.io` that file was `/data/dash.sqlite` inside the container. Container disk is ephemeral: the instance sleeps after an hour without a request, and every image rollout starts from an empty disk. The next visitor could register as admin.

The hostname needs a database that survives the container. Warehouse adapters, including `@dash/adapter-mongodb`, are separate: they query customer data. This decision is only about Dash's own records.

## Decision

- App state is a MongoDB database named in `MONGODB_URI`. The variable is required in every environment, including local development.
- The URI must use the `mongodb://` or `mongodb+srv://` scheme, must include a database name, and cannot disable TLS verification.
- When the URI includes a username and omits `authSource`, the client authenticates against `admin`. Atlas stores SCRAM users there. The path is still the application database, and Dash creates it on the first successful authentication. The user needs the `readWrite` role on that database. `dbAdmin` can create the database and cannot insert accounts or dashboards.
- Documents use string ids. Email, session token hash, and API token hash are unique indexes. Referential checks that SQLite foreign keys enforced (a session, token, data source, or dashboard must name an existing user) stay in the application.
- `dev.dash.io` receives `MONGODB_URI` as a Worker secret, copied into the container environment on start, the same way as `DASH_SECRET`. It is not baked into the image, not a Wrangler var, and not a GitHub Actions secret. Requests return 500 until both secrets are set. Set it with `pnpm exec wrangler secret put MONGODB_URI` after the Worker exists.
- The Durable Object behind the container keeps `storage: "sqlite"`. That is Cloudflare's storage backend for the container object, not the application database.

## Consequences

A durable MongoDB cluster keeps accounts and saved warehouse credentials across container sleep and deploys. The operator of `dev.dash.io` has to provide `MONGODB_URI`. Local `pnpm dev` needs a reachable MongoDB as well. App tests use an isolated database on the existing Compose MongoDB service (`127.0.0.1:27029` by default) and drop it afterward. They do not use the `dash` fixture database.
