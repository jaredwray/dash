# Dash

AI-first analytics: dashboards, charts, and data sources you can drive from the UI or from [MCP](https://modelcontextprotocol.io).

Dash is a modern Tableau / Looker-style workspace. Agents can list warehouses, run structured queries, and add chart widgets to dashboard pages through the built-in MCP server.

## Screenshots

The screenshots show the Fernway sample company in Postgres, BigQuery, and MongoDB. To get the same dashboards, see [Sample company data](#sample-company-data-development). The Claude Code screenshot comes from an earlier build with a built-in sample warehouse.

### Sign in

`/` opens this page until you are signed in. A signed-in visit goes straight to dashboards.

<img alt="Login form prefilled with the local demo account" src="docs/screenshots/login.png" width="880">

### Dashboards

<img alt="Dashboards list in the Fernway workspace with six dashboards" src="docs/screenshots/dashboards.png" width="880">

### Executive overview

ARR, net revenue retention, paying customers, and gross margin. Charts show ARR by segment, new logos by region, MRR movements, and the burn multiple. A table lists the top 25 customers. The data comes from the finance warehouse in BigQuery, and from the product database and the billing export in Postgres.

<img alt="Executive overview dashboard with KPI cards, ARR and MRR charts, and a top customers table" src="docs/screenshots/executive-overview.png" width="880">

### Customer support

Open tickets, first response time, CSAT, and NPS. Charts show ticket volume, categories, response time by priority, and survey results. The data comes from the support collections in MongoDB.

<img alt="Customer support dashboard with KPI cards, ticket charts, and a table of open tickets" src="docs/screenshots/customer-support.png" width="880">

### In Claude Code

The same product-revenue chart, drawn in the session after a Dash MCP query against the sample warehouse.

<img alt="Revenue by product bar chart inside Claude Code" src="docs/screenshots/claude-code.png" width="880">

### Data sources

<img alt="Data sources page with the Fernway Postgres, BigQuery, and MongoDB sources" src="docs/screenshots/data-sources.png" width="880">

### API tokens

<img alt="API tokens page for issuing a scoped MCP client token" src="docs/screenshots/api-tokens.png" width="880">

### Team

Everyone in the organization with their role. Administrators invite people with a single-use link and switch members between **User** and **Admin**.

<img alt="Team page with members, roles, an invite form, and a pending invitation" src="docs/screenshots/team.png" width="880">

### Settings

<img alt="Organization settings, the Sample company data panel after a seed run, and the Dash MCP endpoint" src="docs/screenshots/settings.png" width="880">

### Profile

<img alt="Profile page for the demo admin user" src="docs/screenshots/profile.png" width="880">

## Requirements

- [Node.js 24](https://nodejs.org/) (Active LTS)
- [pnpm](https://pnpm.io/) 12 (pinned to 12.16.1 in `package.json`)
- MongoDB. App state is the database named in `MONGODB_URI`.

## Monorepo

```text
packages/web/                @dash/web              UX + REST API + MCP (TanStack Start)
packages/site/               @dash/site             Public website (Next.js, static export)
packages/core/               @dash/core             Shared types and adapter interfaces
packages/seed/               @dash/seed             Development seed: Fernway sample company and writers
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

## Public website

`packages/site` (`@dash/site`) is the public website. It tells visitors that Dash is open source and free to host, and it describes the paid Dash Cloud service. The stack is Next.js, Tailwind CSS, Biome, and Vitest.

```bash
pnpm dev:site
```

Open [http://localhost:3001](http://localhost:3001). `pnpm --filter @dash/site build` writes static files to `packages/site/out/`. Any static host can serve that directory.

- Repository, Dash Cloud, and contact links are in `packages/site/src/lib/site.ts`.
- Plan names, prices, and features are in one data file. Change a price there, not in a component.
- Dash Cloud runs in this website, not on a separate host. Sign-up is at `/register/` and sign-in is at `/login/`. Until the account system exists, those pages ask visitors to write for early access. Search engines do not index them.
- The prices and the `hello@dash.io` address are placeholders until launch.

See [ADR 0011](docs/adr/0011-public-website.md).

## First account

Set `DASH_SEED_DEMO=false` to start with no users. The login page does not show the demo admin in that mode.

There is no separate user-admin CLI. Accounts are created in the product:

1. Open the app. With no users, sign-in points at `/register`. The first account becomes the administrator.
2. Later people use the same registration form while **Settings → Allow new account registration** is on.
3. An administrator turns that setting off to keep the organization closed. Registration stays available while there are no users, so a fresh database can always create its first admin.
4. With registration closed, an administrator adds people from **Team**: enter an email, pick **User** or **Admin**, and share the sign-up link. Dash does not send email. A link works once and expires after 7 days.

`GET /api/auth/bootstrap` is public and reports whether the demo login should be shown, whether the organization still needs that first account, and whether registration is open.

## Sample company data (development)

Dash can write a realistic dataset into the data sources that you configured. The dataset is for Fernway, Inc., a fictional B2B SaaS company. It has 36 months of history that ends with the last full month. Use it to test dashboards, charts, and agents against real engines.

The numbers agree across sources. Finance MRR equals the subscriptions in the product database. Collections equal the successful charges. Each account id is the same in every source. At the standard size, Fernway grows from about $7M to about $35M ARR, with about 110% net revenue retention.

| Domain | Contents | Kinds, in order of preference |
| --- | --- | --- |
| Product database | Accounts, users, plans, subscriptions, subscription events | Postgres, BigQuery, MongoDB |
| Billing | Customers, invoices, charges, refunds, and disputes in the shape of a Stripe export | Postgres, BigQuery, MongoDB |
| Sales CRM | Sales reps, leads, opportunities, stage history | Postgres, BigQuery, MongoDB |
| Finance warehouse | GL entries, opex, headcount, MRR movements, SaaS KPIs | BigQuery, Postgres, MongoDB |
| Product analytics | Raw events, account usage, active users, feature adoption, cohort retention | BigQuery, Postgres, MongoDB |
| Marketing analytics | Campaigns, ad spend, web sessions, signup funnel | BigQuery, Postgres, MongoDB |
| Customer support | Tickets with conversations, CSAT, NPS, agents, incidents | MongoDB, Postgres, BigQuery |

Each domain goes to the oldest source of the first kind on its list. A Postgres or BigQuery source receives one `fernway_<domain>` schema or dataset for each domain. A MongoDB source receives `<domain>_<table>` collections in its configured database. Each domain has raw tables and `mart_*` tables. Dash queries do not join or group rows, so the charts read the marts.

To seed the local clusters:

1. Start the clusters with `pnpm test:services:start`.
2. In `.env`, set `MONGODB_URI=mongodb://dash:dash@127.0.0.1:27029/dash_app?authSource=admin` and `DASH_SEED_DEV_SOURCES=true`.
3. Run `pnpm dev` and sign in as an administrator.
4. On **Data sources**, add these sources:
   - Postgres: `postgres://dash:dash@127.0.0.1:54329/fernway`
   - MongoDB: `mongodb://dash:dash@127.0.0.1:27029/fernway?authSource=admin`
   - BigQuery: project `dash`, API endpoint `http://127.0.0.1:9059`, and no default dataset
5. Open **Settings**, go to **Sample company data**, select a size, and click **Seed data sources**.

Do not point a source at the `dash` fixture database. The adapter tests expect only their fixture tables there. The Postgres cluster creates an empty `fernway` database for this purpose. Use the **Small** size with the BigQuery emulator, because the emulator keeps all data in its 1 GiB of memory.

The run continues in the background. The panel shows each domain and its row count. When the run is complete, the shared **Fernway** workspace has six dashboards: Executive overview, Revenue & billing, Sales pipeline, Product engagement, Marketing performance, and Customer support. **Remove sample data** drops the data that the seeder wrote and deletes those dashboards.

Safety rules:

- The feature is off unless `DASH_SEED_DEV_SOURCES=true`. Production (`NODE_ENV=production`) ignores the flag.
- Only an administrator with a browser session can start a run. API tokens and MCP cannot.
- Dash writes only to `fernway_*` schemas and datasets, and to the MongoDB collections that its manifest records. Each target holds a `dash_seed_manifest` table or collection.
- Dash refuses a target that exists without that manifest. It examines every target before the first write.
- Dash replaces and drops only the tables that the manifest lists. It keeps any other table in a seeded schema or dataset, and it drops a schema or dataset only when it is empty.
- Dash refuses a MongoDB source that points at the Dash app database.
- Removal acts only on the database that received the data. If someone changes or deletes a source after a seed run, removal keeps its record until a data source points at that database again.
- While a seed or removal run is active, Dash refuses edits to and deletions of data sources. A new data source does not change a run that has started.
- Email addresses use the reserved `.example` domain, so no seeded address can reach a real mailbox.

The generator is in `packages/seed` (`@dash/seed`). It uses `@faker-js/faker` with a fixed seed, so the same month and size give the same data. See [ADR 0010](docs/adr/0010-dev-seed-data-sources.md).

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
- [x] Public website (`@dash/site`): open source and Dash Cloud pages, pricing

### UX

- [x] Login and registration
- [x] User profile
- [x] One organization per instance, with multiple workspaces
- [x] Personal workspaces, private by default, with access for selected organization members
- [x] Shared workspaces that organization admins create and manage
- [x] Viewer and editor access, with workspace checks for dashboard API and MCP requests
- [x] Team members: member list, User / Admin roles, invitation links
- [x] Settings
- [x] Dynamic dashboard pages
- [x] Chart widgets (TanStack Charts)
- [x] Sortable and filterable tables (TanStack Table)
- [x] Data sources page (admin): add and remove sources (Postgres, MySQL, Snowflake, MongoDB, BigQuery, Databricks SQL, Redshift)
- [x] Development seed: the Fernway sample company in Postgres, MongoDB, and BigQuery sources (`DASH_SEED_DEV_SOURCES`)
- [ ] Real-time multi-user dashboard collaboration
- [ ] Light theme

### API and agents

- [x] REST API
- [x] Session authentication (httpOnly cookie)
- [x] API tokens (hashed, scoped, expiring, revocable)
- [x] Agent tokens page with a full MCP URL and copy controls
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
| POST | `/api/auth/register` | The first user becomes admin. Registration is closed when users exist and the switch is off. When the domain list is not empty, the email domain must be on that list. |
| POST | `/api/auth/invitation` | Public. Preview an invitation from its token |
| POST | `/api/auth/invitation/accept` | Public. Create the invited account and set `dash_session`. Works while registration is off |
| POST | `/api/auth/login` | Sets `dash_session` |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | |
| PATCH | `/api/users/me` | Profile / password |
| GET | `/api/members` | Everyone in the organization |
| PATCH | `/api/members/:id` | Change role. Admin session only. The last admin cannot be demoted |
| GET/POST | `/api/invitations` | Admin session only. POST returns the link token once |
| DELETE | `/api/invitations/:id` | Revoke. Admin session only |
| GET/PATCH | `/api/settings` | PATCH is admin-only. `allowedEmailDomains` lists the email domains that can create accounts. An empty list allows every domain. |
| GET/POST | `/api/data-sources` | POST is admin-only |
| GET/PATCH/DELETE | `/api/data-sources/:id` | |
| GET | `/api/data-sources/:id/schema` | |
| POST | `/api/data-sources/:id/connect` | Connection test |
| POST | `/api/data-sources/:id/query` | Structured query |
| GET/POST/DELETE | `/api/dev-seed` | Development only. Answers 404 unless `DASH_SEED_DEV_SOURCES` is `true` outside production. Admin session only. GET returns the plan and the run state. POST starts a seed run, and DELETE starts a removal |
| GET/POST | `/api/workspaces` | Session only. POST requires an organization admin |
| PATCH | `/api/workspaces/:id` | Rename. Workspace manager session only |
| GET/PUT | `/api/workspaces/:id/members` | Workspace manager session only. PUT sets viewer/editor access or removes access with a null role |
| GET/POST | `/api/dashboards` | Selected workspace. POST requires editor access |
| GET/PATCH/DELETE | `/api/dashboards/:id` | Selected workspace. PATCH and DELETE require editor access |
| GET/POST | `/api/tokens` | Session only; token value shown once |
| DELETE | `/api/tokens/:id` | Revoke |
| GET/POST | `/mcp` | Bearer token with `mcp` scope |

## Organizations and workspaces

Each Dash instance serves one organization. Accounts, organization settings, invitations, and data sources belong to that instance.

Each user receives a personal workspace. Only its owner has access at first. The owner can share it with existing organization members.
Organization admins can create shared workspaces and manage their access. Admins cannot access another person's personal workspace without an explicit grant.
Viewers can read dashboards. Editors can create, change, and delete dashboards. Workspace managers control names and access.

Select a workspace in the sidebar. Open **Workspaces** to manage access or copy a workspace link.
A link retains the selected workspace, but it does not grant access. Without a workspace in the URL, Dash opens your personal workspace.

Data sources remain available throughout the organization. Only organization admins can add, change, or remove them.
Workspace privacy protects dashboards; it does not restrict access to data sources.

Session API clients select a workspace with the `X-Dash-Workspace-Id` header. Without that header, dashboard requests use the user's personal workspace.
New API tokens bind to the workspace selected at creation. Tokens cannot select another workspace. Each request checks current membership and token scopes.
This change does not migrate existing dashboards or tokens. See [ADR 0009](docs/adr/0009-organization-workspaces.md).

## MCP

Select the target workspace. Open **Agent tokens** (`/agent-tokens`). Issue a token with the required `read` and `mcp` scopes. Select `write` for dashboard changes. New tokens expire after 90 days. Copy the full MCP URL from the banner. The URL uses the current site address and the `/mcp` path. Set the client authorization header to `Authorization: Bearer <token>`.

The Agent tokens page lists API tokens with the `mcp` scope. You can revoke these tokens from either token page. Tools include `list_data_sources`, `get_schema`, `query_data`, `list_dashboards`, `get_dashboard`, `create_dashboard`, and `add_chart_widget`.

## Scripts

| Command | |
| --- | --- |
| `pnpm dev` | Start `@dash/web` |
| `pnpm dev:site` | Start the public website (`@dash/site`) on port 3001 |
| `pnpm lint` | Biome lint and format check (`@dash/site`) |
| `pnpm test:services:start` | Start warehouse clusters (Docker Compose) |
| `pnpm test:services:stop` | Stop clusters and delete their data |
| `pnpm test:shutdown` | Send SIGTERM to the built `@dash/web` server and make sure that it exits. Run `pnpm --filter @dash/web build` and start the clusters first |
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
- [ADR 0011](docs/adr/0011-public-website.md) — public website (Next.js static export)

## Dev deploy

Pushes to `main` run `.github/workflows/deploy-dev.yml`. Wrangler builds `Dockerfile`, pushes the image, and attaches the Worker to `https://dev.dash.io`. `workers.dev` is off.

The container runs `node .output/server/index.mjs` from `@dash/web`. One instance named `dev` serves the host. Users, sessions, and saved data sources are stored in the MongoDB database named by `MONGODB_URI`, so they survive container sleep and the next image. The demo user is not seeded. Put Cloudflare Access in front of the hostname if the dev host should not be public.

Cloudflare sends SIGTERM to the container when it sleeps and when a new image rolls out. The Node server then stops its listener and closes the MongoDB client and the cached data-source adapters, so the process exits. If a handle keeps the process alive for 10 seconds after the server closes, the server exits with code 1. A process that stays alive with no listener causes `Error proxying request to container` on each request.

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
