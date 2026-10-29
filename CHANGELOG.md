# Changelog

All notable changes to Dash are documented here.

## Unreleased

### Fixed

- Databricks SQL sends integers outside the 32-bit range as `BIGINT`, keeps `DECIMAL` values and integers that do not fit a safe JavaScript number as strings, and inlines `LIMIT` and `OFFSET`. Query pages request one extra row so an exact page is not marked truncated. External result links are refused even when some rows arrived inline, repeated chunks are rejected, and closing the client or timing out cancels the warehouse statement. `http` is allowed only for loopback. Introspection normalizes DuckDB and Spark type names, skips unnamed columns, and stops after 10,000 columns unless a schema is set. The test cluster receives `DASH_TEST_DATABRICKS_TOKEN`, `DASH_TEST_DATABRICKS_WAREHOUSE`, `DASH_TEST_DATABRICKS_CATALOG`, and `DASH_TEST_DATABRICKS_SCHEMA`.

### Added

- `@dash/adapter-redshift` (`packages/redshift-adapter`) implementing `DataAdapter`. Structured queries compile to parameterized SQL over the PostgreSQL wire protocol. Connections encrypt by default. `sslmode=require` and `verify-ca` check the certificate chain without the host name, and `verify-full` checks both. Queries stop after 60 seconds. Null filters compile to `IS NULL` / `IS NOT NULL`. The local test cluster is the `redshift` service in `docker-compose.test.yml`, a PostgreSQL stand-in on `127.0.0.1:54399`.
- `@dash/adapter-databricks` (`packages/databricks-adapter`) implementing `DataAdapter`. Structured queries compile to parameterized Databricks SQL (`:p0` binds) over the Statement Execution API. The local test cluster is the `databricks` service in `docker-compose.test.yml`, a 512 MiB in-memory DuckDB warehouse behind that API.
- `@dash/adapter-mysql` (`packages/mysql-adapter`) implementing `DataAdapter`. Structured queries compile to parameterized SQL (`?` placeholders). `like` uses a binary collation so it stays case-sensitive; `ilike` compiles to `LOWER(column) LIKE LOWER(?)` because MySQL has no `ILIKE`. Connection URIs are parsed in-process so driver query parameters cannot enable `LOCAL_FILES` or `debug`. The local test cluster is the `mysql` service in `docker-compose.test.yml` (`mysql://dash:dash@127.0.0.1:33029/dash`). Administrators can add it from a `mysql://` URI or from host, port, database, user, and password fields.
- `@dash/adapter-bigquery` (`packages/bigquery-adapter`) implementing `DataAdapter`. Structured queries compile to parameterized GoogleSQL. The local test cluster is the `bigquery` service in `docker-compose.test.yml`, a 256 MiB in-memory emulator.
- `@dash/adapter-mongodb` (`packages/mongodb-adapter`) implementing `DataAdapter`. Structured queries compile to a MongoDB `find` with validated field names and scalar BSON values. The local test cluster is the `mongodb` service in `docker-compose.test.yml`.
- Local Docker Compose clusters for adapter tests, started with `pnpm test:services:start` and stopped with `pnpm test:services:stop`. Postgres, MySQL, MongoDB, BigQuery, Databricks SQL, and Redshift adapter tests run against those clusters.
- `@dash/adapter-snowflake` (`packages/snowflake-adapter`) implementing `DataAdapter` with parameterized SQL (`?` binds) over the Snowflake HTTPS session API.
- README screenshots of sign-in, dashboards, the sample warehouse, a custom regional revenue page, the same chart inside Claude Code, API tokens, settings, and profile.
- PNPM workspace monorepo on Node.js 24 (Active LTS).
- `@dash/core` package with data-adapter types, structured queries, chart specs, dashboards, and API token helpers.
- `@dash/adapter-postgres` implementing `DataAdapter` with parameterized SQL.
- `@dash/web` MVP (in `packages/web`): login, register, profile, settings, admin data sources, dynamic dashboards, TanStack Charts, TanStack Table, REST API with session and hashed API tokens, and an MCP server at `/mcp`.

### Changed

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
