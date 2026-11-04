# Dash

AI-first analytics: dashboards, charts, and data sources you can drive from the UI or from [MCP](https://modelcontextprotocol.io).

Dash is a modern Tableau / Looker-style workspace. Agents can list warehouses, run structured queries, and add chart widgets to dashboard pages through the built-in MCP server.

## Screenshots

Taken from the demo workspace (`admin@dash.dev`). The sample warehouse ships with a **Growth overview** page. **Regional revenue review** is a custom page on the same data.

### Sign in

`/` opens this page until you are signed in. A signed-in visit goes straight to dashboards.

<img alt="Login form prefilled with the local demo account" src="docs/screenshots/login.png" width="880">

### Dashboards

<img alt="Dashboards list showing Growth overview and Regional revenue review" src="docs/screenshots/dashboards.png" width="880">

### Growth overview

KPI tiles, a stacked revenue area chart, product mix, signups versus churn, units by product, and a filterable product table.

<img alt="Growth overview dashboard with KPI cards, charts, and a product table" src="docs/screenshots/growth-overview.png" width="880">

### Regional revenue review

A custom page: product revenue, share of sales, the regional stack for the last 12 months, and net new accounts.

<img alt="Custom Regional revenue review dashboard" src="docs/screenshots/regional-revenue.png" width="880">

### In Claude Code

The same product-revenue chart, drawn in the session after a Dash MCP query against the sample warehouse.

<img alt="Revenue by product bar chart inside Claude Code" src="docs/screenshots/claude-code.png" width="880">

### Data sources

<img alt="Data sources page with the built-in sample warehouse" src="docs/screenshots/data-sources.png" width="880">

### API tokens

<img alt="API tokens page for issuing a scoped MCP client token" src="docs/screenshots/api-tokens.png" width="880">

### Team

Everyone in the workspace with their role. Administrators invite people with a single-use link and switch members between **User** and **Admin**.

<img alt="Team page with members, roles, an invite form, and a pending invitation" src="docs/screenshots/team.png" width="880">

### Settings

<img alt="Workspace settings and the Dash MCP endpoint note" src="docs/screenshots/settings.png" width="880">

### Profile

<img alt="Profile page for the demo admin user" src="docs/screenshots/profile.png" width="880">

## Requirements

- [Node.js 24](https://nodejs.org/) (Active LTS)
- [pnpm](https://pnpm.io/) 12 (pinned to 12.16.1 in `package.json`)
- MongoDB. App state is the database named in `MONGODB_URI`.

## Monorepo

```text
packages/web/                @dash/web              UX + REST API + MCP (TanStack Start)
packages/core/               @dash/core             Shared types and adapter interfaces
packages/postgres-adapter/   @dash/adapter-postgres
packages/mysql-adapter/      @dash/adapter-mysql
packages/snowflake-adapter/  @dash/adapter-snowflake
packages/mongodb-adapter/    @dash/adapter-mongodb
packages/bigquery-adapter/   @dash/adapter-bigquery
packages/databricks-adapter/ @dash/adapter-databricks
packages/redshift-adapter/   @dash/adapter-redshift
packages/stripe-adapter/     @dash/adapter-stripe
```

Workspaces are declared in the root `pnpm-workspace.yaml`.

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). With `DASH_SEED_DEMO=true` (the default), the app seeds a demo admin and shows those credentials on the login page:

| | |
| --- | --- |
| Email | `admin@dash.dev` |
| Password | `dashadmin` |

Set `MONGODB_URI` in `.env` or the environment before starting the app. `pnpm dev` reads the repo `.env`; a variable already set in the environment wins. The path is the database name (`/dash`). Dash creates that database the first time it connects. A username without `authSource` authenticates against `admin`, where Atlas stores SCRAM users, and that user needs the `readWrite` role on the database. Change `DASH_SECRET` before exposing the app.

## First account

Set `DASH_SEED_DEMO=false` to start with no users and no sample warehouse. The login page does not show the demo admin in that mode.

There is no separate user-admin CLI. Accounts are created in the product:

1. Open the app. With no users, sign-in points at `/register`. The first account becomes the administrator.
2. Later people use the same registration form while **Settings → Allow new account registration** is on.
3. An administrator turns that setting off to keep the workspace closed. Registration stays available while there are no users, so a fresh database can always create its first admin.
4. With registration closed, an administrator adds people from **Team**: enter an email, pick **User** or **Admin**, and share the sign-up link. Dash does not send email. A link works once and expires after 7 days.

`GET /api/auth/bootstrap` is public and reports whether the demo login should be shown, whether the workspace still needs that first account, and whether registration is open.

## Feature checklist

Keep this list in sync as PRs land. Checked items are in the tree today.

### Platform

- [x] PNPM workspace monorepo
- [x] Node.js 24
- [x] Core types package (`@dash/core`)
- [x] Data adapter interface (`DataAdapter`)
- [x] Postgres adapter (`@dash/adapter-postgres`)
- [x] Local Docker Compose clusters for adapter tests (`pnpm test:services:start` / `test:services:stop`)
- [x] Dev deploy to `dev.dash.io` (Cloudflare Worker + container, GitHub Actions)
- [x] MySQL adapter (`@dash/adapter-mysql`)
- [x] MongoDB adapter (`@dash/adapter-mongodb`)
- [x] Google BigQuery adapter (`@dash/adapter-bigquery`)
- [x] Snowflake adapter (`@dash/adapter-snowflake`)
- [x] Databricks SQL adapter (`@dash/adapter-databricks`)
- [x] Redshift adapter (`@dash/adapter-redshift`)
- [x] Stripe adapter (`@dash/adapter-stripe`)
- [ ] ClickHouse adapter

### UX

- [x] Login and registration
- [x] User profile
- [x] Team members: member list, User / Admin roles, invitation links
- [x] Settings
- [x] Dynamic dashboard pages
- [x] Chart widgets (TanStack Charts)
- [x] Sortable and filterable tables (TanStack Table)
- [x] Data sources page (admin): add and remove sources (demo warehouse, Postgres, MySQL, Snowflake, MongoDB, BigQuery, Databricks SQL, Redshift)
- [ ] Real-time multi-user dashboard collaboration
- [ ] Light theme

### API and agents

- [x] REST API
- [x] Session authentication (httpOnly cookie)
- [x] API tokens (hashed, scoped, expiring, revocable)
- [x] MCP server (`POST /mcp`) for charts and dashboards
- [x] Public health checks (`GET /healthz`, `GET /ping`) that verify the app database
- [ ] OAuth for MCP clients

## REST surface

All routes except bootstrap, register, login, invitation preview and accept, healthz, and ping require a session cookie or `Authorization: Bearer dash_live_…`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/healthz` | Public. Confirms the app MongoDB is connected |
| GET | `/ping` | Public. Confirms the app MongoDB is connected |
| GET | `/api/auth/bootstrap` | Public. Demo login, first-account setup, registration |
| POST | `/api/auth/register` | First user becomes admin. Closed when users exist and registration is off |
| POST | `/api/auth/invitation` | Public. Preview an invitation from its token |
| POST | `/api/auth/invitation/accept` | Public. Create the invited account and set `dash_session`. Works while registration is off |
| POST | `/api/auth/login` | Sets `dash_session` |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | |
| PATCH | `/api/users/me` | Profile / password |
| GET | `/api/members` | Everyone in the workspace |
| PATCH | `/api/members/:id` | Change role. Admin session only. The last admin cannot be demoted |
| GET/POST | `/api/invitations` | Admin session only. POST returns the link token once |
| DELETE | `/api/invitations/:id` | Revoke. Admin session only |
| GET/PATCH | `/api/settings` | PATCH is admin-only |
| GET/POST | `/api/data-sources` | POST is admin-only |
| GET/PATCH/DELETE | `/api/data-sources/:id` | |
| GET | `/api/data-sources/:id/schema` | |
| POST | `/api/data-sources/:id/connect` | Connection test |
| POST | `/api/data-sources/:id/query` | Structured query |
| GET/POST | `/api/dashboards` | |
| GET/PATCH/DELETE | `/api/dashboards/:id` | |
| GET/POST | `/api/tokens` | Session only; token value shown once |
| DELETE | `/api/tokens/:id` | Revoke |
| GET/POST | `/mcp` | Bearer token with `mcp` scope |

## MCP

Issue a token with the `mcp` scope, then point a client at `/mcp`. Tools include `list_data_sources`, `get_schema`, `query_data`, `list_dashboards`, `get_dashboard`, `create_dashboard`, and `add_chart_widget`.

## Scripts

| Command | |
| --- | --- |
| `pnpm dev` | Start `@dash/web` |
| `pnpm test:services:start` | Start warehouse clusters (Docker Compose) |
| `pnpm test:services:stop` | Stop clusters and delete their data |
| `pnpm test` | Run package tests. Adapter tests and `@dash/web` app-database tests use the clusters |
| `pnpm typecheck` | TypeScript across workspaces |
| `pnpm build` | Production build |
| `pnpm deploy:dev` | `wrangler deploy` of the dev Worker and container (`dev.dash.io`) |

## Adapter test clusters

Postgres, MySQL, MongoDB, BigQuery, Databricks SQL, Redshift, and Stripe adapter tests run against the Compose cluster. The Redshift service is a PostgreSQL wire-protocol stand-in. The Stripe service is a list-API fixture. Add the next local engine beside them in `docker-compose.test.yml` when that adapter can run here.

```bash
pnpm test:services:start
pnpm test
pnpm test:services:stop
```

`test:services:start` waits until each cluster is healthy. `test:services:stop` removes containers and volumes, so the next start reloads fixture SQL.

| | Postgres | MySQL | MongoDB | Redshift |
| --- | --- | --- | --- | --- |
| URL | `postgres://dash:dash@127.0.0.1:54329/dash` | `mysql://dash:dash@127.0.0.1:33029/dash` | `mongodb://dash:dash@127.0.0.1:27029/dash?authSource=admin` | `redshift://dash:dash@127.0.0.1:54399/dash` |
| Host | `127.0.0.1` | `127.0.0.1` | `127.0.0.1` | `127.0.0.1` |
| Port | `54329` | `33029` | `27029` | `54399` |
| Database | `dash` | `dash` | `dash` | `dash` |
| User | `dash` | `dash` | `dash` | `dash` |
| Password | `dash` | `dash` | `dash` | `dash` |

Databricks SQL listens at `http://127.0.0.1:14439` with token `dash`, warehouse `dash`, catalog `dash`, and schema `analytics`. Stripe listens at `http://127.0.0.1:12119`.

Override the Postgres endpoint with `DASH_TEST_POSTGRES_HOST`, `DASH_TEST_POSTGRES_PORT`, `DASH_TEST_POSTGRES_DATABASE`, `DASH_TEST_POSTGRES_USER`, and `DASH_TEST_POSTGRES_PASSWORD`. Override MySQL with `DASH_TEST_MYSQL_HOST`, `DASH_TEST_MYSQL_PORT`, `DASH_TEST_MYSQL_DATABASE`, `DASH_TEST_MYSQL_USER`, and `DASH_TEST_MYSQL_PASSWORD`. Override MongoDB with `DASH_TEST_MONGODB_HOST`, `DASH_TEST_MONGODB_PORT`, `DASH_TEST_MONGODB_DATABASE`, `DASH_TEST_MONGODB_USER`, `DASH_TEST_MONGODB_PASSWORD`, and `DASH_TEST_MONGODB_AUTH_SOURCE`. Override Databricks SQL with `DASH_TEST_DATABRICKS_HOST`, `DASH_TEST_DATABRICKS_PORT`, `DASH_TEST_DATABRICKS_HTTP_PATH`, `DASH_TEST_DATABRICKS_TOKEN`, `DASH_TEST_DATABRICKS_WAREHOUSE`, `DASH_TEST_DATABRICKS_CATALOG`, and `DASH_TEST_DATABRICKS_SCHEMA`. Override Redshift with `DASH_TEST_REDSHIFT_HOST`, `DASH_TEST_REDSHIFT_PORT`, `DASH_TEST_REDSHIFT_DATABASE`, `DASH_TEST_REDSHIFT_USER`, and `DASH_TEST_REDSHIFT_PASSWORD`. Override Stripe with `DASH_TEST_STRIPE_HOST`, `DASH_TEST_STRIPE_PORT`, and `DASH_TEST_STRIPE_KEY`. The port values are the host ports Compose publishes. Databricks token, warehouse, catalog, and schema are passed into the container; the HTTP path has to use that warehouse id. The Stripe key is passed into the fixture as `DASH_STRIPE_KEY`. These credentials are for the local test clusters only.

## Architecture notes

- [ADR 0001](docs/adr/0001-monorepo-architecture.md) — workspace layout
- [Data adapters](docs/data-adapters.md) — adding a warehouse adapter
- [ADR 0002](docs/adr/0002-charting-library.md) — original ECharts renderer (superseded)
- [ADR 0003](docs/adr/0003-api-tokens.md) — sessions, tokens, encryption
- [ADR 0004](docs/adr/0004-tanstack-charts.md) — TanStack Charts + `ChartSpec`
- [ADR 0005](docs/adr/0005-adapter-test-clusters.md) — adapter tests use local clusters
- [ADR 0006](docs/adr/0006-dev-workers-container.md) — dev.dash.io Worker and container
- [ADR 0007](docs/adr/0007-mongodb-app-state.md) — app state in MongoDB
- [ADR 0008](docs/adr/0008-team-invitations.md) — team members and invitations

## Dev deploy

Pushes to `main` run `.github/workflows/deploy-dev.yml`. Wrangler builds `Dockerfile`, pushes the image, and attaches the Worker to `https://dev.dash.io`. `workers.dev` is off.

The container runs `node .output/server/index.mjs` from `@dash/web`. One instance named `dev` serves the host. Users, sessions, and saved data sources are stored in the MongoDB database named by `MONGODB_URI`, so they survive container sleep and the next image. The demo user is not seeded. Put Cloudflare Access in front of the hostname if the dev host should not be public.

GitHub Actions secrets:

| Secret | |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workers Scripts edit, Containers edit, and DNS edit on the `dash.io` zone |
| `CLOUDFLARE_ACCOUNT_ID` | Account that owns the Worker |

The workflow deploys the `dash-development` Worker without `DASH_SECRET` or `MONGODB_URI`. After that first deploy, set both on that Worker:

```bash
pnpm exec wrangler secret put DASH_SECRET
pnpm exec wrangler secret put MONGODB_URI
```

Until either is set, requests to `dev.dash.io` return 500. Later deploys leave the secrets in place. `DASH_SECRET` encrypts saved data-source credentials and must not be `change-me-in-production`. `MONGODB_URI` is the MongoDB connection string for app state and must name a database (`mongodb://…/dash` or `mongodb+srv://…/dash`). Atlas SCRAM users live in `admin`; omit `authSource` and Dash authenticates there. Grant that user `readWrite` on the named database.

Cloudflare logging is on for the Worker and the container. The Worker sends Workers Logs: one invocation log per request (method, URL, status, and headers) and its own structured lines. Those are `request blocked` with the reason when a secret is missing, `container started`, and `container stopped` or `container crashed` with the exit code. The container sends whatever the Node server writes to stdout and stderr. In the Cloudflare dashboard, Worker logs are under Workers & Pages → `dash-development` → Logs. Container logs are under Containers → `dash-development-dashcontainer`. Stream the Worker's logs live with:

```bash
pnpm exec wrangler tail dash-development
```

`pnpm deploy:dev` runs `wrangler deploy` locally. `pnpm deploy` is pnpm's own command and does not run this script. Docker has to be running.

## License

MIT. See [LICENSE](LICENSE).
