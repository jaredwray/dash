# Changelog

All notable changes to Dash are documented here.

## Unreleased

### Fixed

- Cloud setup installs Aikido Safe Chain 1.5.27. Version 1.5.15 exits on pnpm 12, so the environment build fails and agents boot the default image.
- Sidebar sections use a subtle blue selected state with a left accent and brighter icon. Keyboard focus gets its own inset outline, and the current section is announced to screen readers.
- App MongoDB connections authenticate a URI user against `admin` when `authSource` is omitted, which is where Atlas stores SCRAM users. The database named in the URI is created on that first connection. A `dbAdmin` role still cannot store accounts; sign-in reports that the user needs `readWrite` on that database. MongoDB data-source connection strings follow the same `authSource` default.
- `pnpm dev` reads `MONGODB_URI`, `DASH_SECRET`, and `DASH_SEED_DEMO` from the repo `.env`. Vite does not copy those unprefixed variables into the server process. Values already set in the environment win, and production ignores `.env`.
- Databricks SQL sends integers outside the 32-bit range as `BIGINT`, keeps `DECIMAL` values and integers that do not fit a safe JavaScript number as strings, and inlines `LIMIT` and `OFFSET`. Query pages request one extra row so an exact page is not marked truncated. External result links are refused even when some rows arrived inline, repeated chunks are rejected, and closing the client or timing out cancels the warehouse statement. `http` is allowed only for loopback. Introspection normalizes DuckDB and Spark type names, skips unnamed columns, and stops after 10,000 columns unless a schema is set. The test cluster receives `DASH_TEST_DATABRICKS_TOKEN`, `DASH_TEST_DATABRICKS_WAREHOUSE`, `DASH_TEST_DATABRICKS_CATALOG`, and `DASH_TEST_DATABRICKS_SCHEMA`.

### Added

- The Agent tokens page creates and revokes tokens for MCP access. The banner shows the full MCP URL from the current site address, with a copy button.
- Each Dash instance serves one organization with multiple workspaces. Each user receives a personal workspace that they can share with existing organization members.
- Organization admins can create shared workspaces and manage viewer or editor access. Dashboard API and MCP requests check workspace access.
- The sidebar has a workspace selector. Workspace links retain the selected workspace. New API tokens bind to that workspace.


- Cloudflare logging for [dev.dash.io](https://dev.dash.io). `wrangler.jsonc` turns on Workers Logs, with invocation logs, for the `dash-development` Worker and turns on logs for its container, so the Node server's stdout and stderr reach the Cloudflare dashboard. The Worker logs `request blocked` with the reason when `DASH_SECRET` or `MONGODB_URI` is missing, `container started` when the instance boots, and `container stopped` or `container crashed` with the exit code.
- Team page (`/team`) listing every member with their role. Roles are **Admin** and **User** (stored as `member`). Administrators can change a member's role; the last admin cannot be demoted. Administrators can invite people by email and role. Dash creates a single-use sign-up link to share, valid for 7 days, that works while open registration is off. Inviting the same email again replaces the open link. Pending invitations can be reissued or revoked. Invitation tokens are stored as SHA-256 and travel in the URL fragment. New endpoints: `GET /api/members`, `PATCH /api/members/:id`, `GET/POST /api/invitations`, `DELETE /api/invitations/:id`, and the public `POST /api/auth/invitation` and `POST /api/auth/invitation/accept`. Inviting and role changes require an admin session; API tokens cannot use them. See [ADR 0008](docs/adr/0008-team-invitations.md).
- Public `GET /healthz` and `GET /ping` endpoints. Both run a MongoDB `ping` against the app database and return 503 when it is unreachable. A failed probe drops the cached client so the next check can reconnect.
- Dev deploy to [dev.dash.io](https://dev.dash.io). A Cloudflare Worker proxies every request to one container running the `@dash/web` Node server. `wrangler` is a root dev dependency. GitHub Actions workflow `deploy-dev` runs `wrangler deploy` on pushes to `main`. The deploy does not require `DASH_SECRET`; that Worker secret is added after the Worker exists. The demo user is not seeded. Container disk resets when the instance sleeps or a new image rolls out.
- `@dash/adapter-stripe` (`packages/stripe-adapter`) implementing `DataAdapter`. Structured queries read Stripe customers, charges, invoices, and subscriptions. Filters Stripe Search can express are sent as a search query. Sorts other than newest-first read every matching row before paging, and a query that is still incomplete after 10,000 rows fails. The connection test accepts a restricted key that can list any supported object. Summaries record live versus test for restricted keys. The secret key is omitted from connection summaries. `http` is allowed only for a loopback host, and redirects are not followed. The local test cluster is the `stripe` service in `docker-compose.test.yml` at `http://127.0.0.1:12119`.

- `@dash/adapter-redshift` (`packages/redshift-adapter`) implementing `DataAdapter`. Structured queries compile to parameterized SQL over the PostgreSQL wire protocol. Connections encrypt by default. `sslmode=require` and `verify-ca` check the certificate chain without the host name, and `verify-full` checks both. Queries stop after 60 seconds. Null filters compile to `IS NULL` / `IS NOT NULL`. The local test cluster is the `redshift` service in `docker-compose.test.yml`, a PostgreSQL stand-in on `127.0.0.1:54399`.
- `@dash/adapter-databricks` (`packages/databricks-adapter`) implementing `DataAdapter`. Structured queries compile to parameterized Databricks SQL (`:p0` binds) over the Statement Execution API. The local test cluster is the `databricks` service in `docker-compose.test.yml`, a 512 MiB in-memory DuckDB warehouse behind that API.
- `@dash/adapter-mysql` (`packages/mysql-adapter`) implementing `DataAdapter`. Structured queries compile to parameterized SQL (`?` placeholders). `like` uses a binary collation so it stays case-sensitive; `ilike` compiles to `LOWER(column) LIKE LOWER(?)` because MySQL has no `ILIKE`. Connection URIs are parsed in-process so driver query parameters cannot enable `LOCAL_FILES` or `debug`. The local test cluster is the `mysql` service in `docker-compose.test.yml` (`mysql://dash:dash@127.0.0.1:33029/dash`). Administrators can add it from a `mysql://` URI or from host, port, database, user, and password fields.
- `@dash/adapter-bigquery` (`packages/bigquery-adapter`) implementing `DataAdapter`. Structured queries compile to parameterized GoogleSQL. The local test cluster is the `bigquery` service in `docker-compose.test.yml`, a 256 MiB in-memory emulator.
- `@dash/adapter-mongodb` (`packages/mongodb-adapter`) implementing `DataAdapter`. Structured queries compile to a MongoDB `find` with validated field names and scalar BSON values. The local test cluster is the `mongodb` service in `docker-compose.test.yml`.
- Local Docker Compose clusters for adapter tests, started with `pnpm test:services:start` and stopped with `pnpm test:services:stop`. Postgres, MySQL, MongoDB, BigQuery, Databricks SQL, Redshift, and Stripe adapter tests run against those clusters.
- `@dash/adapter-snowflake` (`packages/snowflake-adapter`) implementing `DataAdapter` with parameterized SQL (`?` binds) over the Snowflake HTTPS session API.
- README screenshots of sign-in, dashboards, the sample warehouse, a custom regional revenue page, the same chart inside Claude Code, API tokens, settings, and profile.
- PNPM workspace monorepo on Node.js 24 (Active LTS).
- `@dash/core` package with data-adapter types, structured queries, chart specs, dashboards, and API token helpers.
- `@dash/adapter-postgres` implementing `DataAdapter` with parameterized SQL.
- `@dash/web` MVP (in `packages/web`): login, register, profile, settings, admin data sources, dynamic dashboards, TanStack Charts, TanStack Table, REST API with session and hashed API tokens, and an MCP server at `/mcp`.

### Changed

- The button to copy the MCP URL uses an icon and an accessible label.

- The workspace menu uses icons and a selected marker. It appears only when the user has more than one workspace.

- Security: the lockfile resolves `undici` 7.30.1 in place of 7.29.1. `miniflare` from `wrangler` 4.152.0 requires `undici` 7.29.1. `pnpm-workspace.yaml` overrides only that version. The release fixes CVE-2026-109829, CVE-2026-87018, CVE-2026-109869, and CVE-2026-109383. npm published 7.30.1 on 2026-10-15, so the 7-day cooldown applies. `trustPolicy: no-downgrade` accepts 7.30.1, and this change adds no exclude.
- Data sources, team members, invitations, and settings belong to the organization. This change does not migrate existing dashboards or tokens.

- The login page shows `admin@dash.dev` only when `DASH_SEED_DEMO` is enabled. With seeding off, the first account is created at `/register` and becomes the administrator.
- App state (users, sessions, API tokens, settings, data sources, and dashboards) is stored in MongoDB. `MONGODB_URI` is required and must name a database. `dev.dash.io` reads it from a Worker secret (`wrangler secret put MONGODB_URI`); requests return 500 until `DASH_SECRET` and `MONGODB_URI` are both set. `DASH_DATABASE_PATH` is gone.
- The data-source form can add an Amazon Redshift connection. Choosing Redshift starts with encryption on and clears a URI left over from another kind. Pasting a Redshift URI updates the SSL checkbox from `ssl` and `sslmode`. An explicit SSL flag overrides the URI. Explicit host, port, database, user, and password fields override the same parts of a URI.
- MySQL executes queries with server-side prepared statements, keeping filter values and pagination parameters separate from SQL text.
- MySQL validates identifiers again at the SQL construction boundary and emits only fixed `ASC`/`DESC` sort keywords. Invalid names are rejected rather than cleaned; bound filter values retain their original text.
- Security: `seroval` and `seroval-plugins` 1.6.7 → 1.6.11 (CVE-2026-116581, CVE-2026-116584, CVE-2026-116582, CVE-2026-116583). `@tanstack/router-core` and the Start packages still depend on `^1.6.7`, so `pnpm-workspace.yaml` overrides only versions below 1.6.11. No cooldown skip.
- The data-source form no longer offers Sample warehouse. Postgres, MySQL, Snowflake, MongoDB, BigQuery, Databricks SQL, and Redshift are the kinds an administrator can add.
- Adding a data source starts with a connection URI. Postgres, MySQL, Redshift, Databricks SQL, Snowflake, and MongoDB take their native URIs. BigQuery takes `bigquery://project/dataset`, with optional `location` and `endpoint` query parameters. Field entry is still available, and a BigQuery service account key is pasted separately.
- MongoDB queries keep a dotted collection name when that collection exists, and otherwise still accept `database.collection` for the connected database. Connection strings may be replica-set seed lists and cannot turn off TLS verification. The saved summary reports effective TLS, including the `mongodb+srv` default. `neq null` matches values that are present and not null. Integers that do not fit a safe JavaScript number, and non-integer `Decimal128` values, stay strings.

- Postgres adapter connections fail after 10 seconds instead of waiting on the operating system timeout.
- `@dash/web` moved from `core/` to `packages/web`. `@dash/adapter-postgres` moved from `data-adapters/postgres` to `packages/postgres-adapter`. The root `pnpm-workspace.yaml` lists `packages/*`. A database left at `core/data/dash.sqlite` is moved to the web package data directory on startup when the default `DASH_DATABASE_PATH` is still in use.
- Security: `@tanstack/react-start` 1.168.56 → 1.168.61 (with aligned `@tanstack/react-router` 1.170.42 and `@tanstack/start-server-core` 1.169.40), `zod` 4.6.5 → 4.6.6, and `source-map-js` 1.2.1 → 1.2.2.
- Chart widgets render with TanStack Charts (`@tanstack/charts@1.0.0`) instead of Apache ECharts. Stored `ChartSpec` documents are unchanged. That release is exempt from the 7-day dependency cooldown; the exception is version-scoped in `pnpm-workspace.yaml`.
- `/` no longer shows a marketing landing page. Signed-in visitors go to dashboards; everyone else goes to sign-in.
- README requirement is pnpm 12, matching the `package.json` pin (`12.5.1`).
- Data sources admin page can add Postgres, MySQL, Snowflake, MongoDB, BigQuery, Databricks SQL, or Redshift, and can remove any source, including a seeded sample warehouse.
