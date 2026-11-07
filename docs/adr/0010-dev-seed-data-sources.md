# ADR 0010: Development seed writes into configured data sources

## Status

Accepted. Supersedes the built-in `demo` adapter that [ADR 0005](0005-adapter-test-clusters.md) and [ADR 0009](0009-organization-workspaces.md) mention.

## Context

Developers need realistic data in several real engines to test Dash from end to end. The built-in `demo` adapter held three small tables in process. It did not exercise a driver, a dialect, or a schema browser. The adapter test clusters hold only small fixtures, and the adapter tests assert those fixtures exactly.

A Dash query reads one resource. It has columns, filters, sort order, and a limit. It cannot join, group, or truncate dates. Charts plot the rows that come back, and KPI widgets aggregate those rows in the browser.

## Decision

- A new package, `packages/seed` (`@dash/seed`), generates one fictional B2B SaaS company, Fernway, Inc.
  - The model is one shared simulation. Each domain is a view of it, so the numbers agree across sources. Tests check the agreement: finance MRR against subscription events, collections against charges, and every account reference.
  - The history is 36 months and ends with the last full month before the as-of date. The as-of date is the first day of the current UTC month.
  - Each domain has raw tables and `mart_*` tables. The marts hold rollups, because Dash queries cannot group. Each mart stays under the default query limit of 1,000 rows.
  - The generator uses `@faker-js/faker` pinned to exactly `10.6.0`. npm published that version on 2026-08-14, so it passes the seven-day `minimumReleaseAge`. It has no dependencies and has provenance attestations, so it passes `trustPolicy: no-downgrade`. A seeded randomizer makes the output a pure function of the seed, the as-of date, and the size.
  - Email addresses use the reserved `.example` TLD (RFC 2606).
- The seeder writes into the data sources that an administrator configured. It does not start its own engines.
  - Each domain has a list of kinds in order of preference. It goes to the oldest source of the first kind on its list that has a writer.
  - This version has writers for Postgres, MongoDB, and BigQuery. The lists already name MySQL, Redshift, Snowflake, Databricks, and Stripe, so a new writer needs no change to the plan logic.
- Ownership:
  - Postgres and BigQuery receive one `fernway_<domain>` schema or dataset for each domain. MongoDB receives `<domain>_<table>` collections.
  - Each target holds a `dash_seed_manifest` table or collection. The seeder refuses a target that exists without that manifest. It examines every target before the first write.
  - The manifest lists the tables that the seeder wrote. A replace or a removal touches only those tables. A table with a seed name that the manifest does not list is a conflict. Other tables stay in place, and a schema or dataset is dropped only when it is empty.
  - A Postgres domain is replaced in one transaction. A MongoDB table loads into a temporary collection, which a rename then swaps in. BigQuery uses load jobs with `WRITE_TRUNCATE`.
  - Each writer counts the rows of each table after the write. A count that does not agree fails the step.
- BigQuery load jobs use a multipart upload. Real BigQuery accepts it, including sandbox projects, which refuse streaming inserts and DML. The pinned emulator (0.8.1) answers an upload with no load job, so for a non-Google endpoint the writer uses streaming inserts. A Google endpoint never falls back. On the streaming path, the manifest table only gets new rows and is never dropped, and ownership reads the latest row. Dataset and table management is on `BigQueryAdminClient` in `@dash/adapter-bigquery`. The read adapter does not use it.
- Access:
  - The feature is on only when `DASH_SEED_DEV_SOURCES=true` and `NODE_ENV` is not `production`. Otherwise `/api/dev-seed` answers 404.
  - Only an administrator with a browser session can call it. API tokens and MCP cannot.
  - The Settings page shows the plan before a run. The POST request must send the `planId` of that plan, so a changed source list cannot receive data that nobody reviewed.
  - A MongoDB source that points at the Dash app database is refused.
- The run continues in the server process after the request returns. The `settings` document `dev-seed` holds the progress and works as a lock.
  - Each claim gets a run id. A state write that does not carry the current run id changes nothing, and the worker that made it stops before its next write to a source.
  - While a run is active, `PATCH` and `DELETE` on `/api/data-sources/:id` answer 409, so a run never acts on a connection that changed under it.
  - A timer refreshes the heartbeat every 30 seconds during a run. A run whose heartbeat is older than five minutes counts as stopped. A run in the same process is never taken over.
  - The workspace id and each dashboard id are saved as soon as they exist, so a failed run leaves nothing that removal cannot find.
  - Each ownership record keeps the engine, host, and database or project of its target, with no credentials. Removal refuses a source that now points somewhere else and keeps the record.
  - The server close hook stops a run and closes the writer clients.
- The web app loads `@dash/seed` with a dynamic import, so the generator loads only for a development run.
- The `demo` adapter and the `demo` kind are removed.
  - `DASH_SEED_DEMO` keeps its name and default, and now seeds only the demo admin.
  - A one-time step deletes stored `demo` data sources and the widgets that read them. It also deletes a dashboard that has no widget left. The `settings` document `demo-retired` records that the step ran.

## Consequences

A developer with Docker can get six dashboards on about 190,000 rows in three engines in less than a minute. A fresh app database has no data source until an administrator adds one. The adapter test clusters stay as they are. The Postgres cluster also creates an empty `fernway` database, so local seeding does not change the `dash` fixture database. The BigQuery emulator keeps all data in memory. Its Compose limit goes from 256 MiB to 1 GiB, because a second seed load stopped it at 256 MiB. The README recommends the small size there. Snowflake, MySQL, Redshift, Databricks, and Stripe need writers in a later change. The Databricks stand-in accepts only SELECT, and Stripe needs a test-mode key.
