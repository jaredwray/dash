# ADR 0001: PNPM monorepo layout

## Status

Accepted

## Context

Dash needs a single TypeScript codebase for the product UI, REST API, and MCP server, plus reusable types that every warehouse adapter can implement independently.

## Decision

- Node.js 24 (Active LTS) and PNPM workspaces. Members are declared in the root `pnpm-workspace.yaml` (`packages/*`).
- `packages/web` is the website (`@dash/web`) — TanStack Start hosts UX, REST routes, and MCP together.
- `packages/core` (`@dash/core`) holds adapter and domain types only.
- `packages/postgres-adapter` (`@dash/adapter-postgres`) is the Postgres warehouse adapter. `packages/mysql-adapter` (`@dash/adapter-mysql`) is the MySQL adapter. `packages/snowflake-adapter` (`@dash/adapter-snowflake`) is the Snowflake warehouse adapter. `packages/mongodb-adapter` (`@dash/adapter-mongodb`) is the MongoDB adapter. `packages/bigquery-adapter` (`@dash/adapter-bigquery`) is the BigQuery adapter. `packages/databricks-adapter` (`@dash/adapter-databricks`) is the Databricks SQL adapter. Additional adapters are their own packages under `packages/`.

## Consequences

Adapters can be added without rewriting the app. The website depends on `@dash/core` and the adapters it currently hosts. New adapters register in `packages/web/src/server/adapters/registry.ts`.
