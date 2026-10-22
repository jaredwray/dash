# Changelog

All notable changes to Dash are documented here.

## Unreleased

### Added

- Local Docker Compose clusters for adapter tests, started with `pnpm test:services:start` and stopped with `pnpm test:services:stop`. Postgres adapter tests run against that cluster.
- PNPM workspace monorepo on Node.js 24 (Active LTS).
- `@dash/core` package with data-adapter types, structured queries, chart specs, dashboards, and API token helpers.
- `@dash/adapter-postgres` implementing `DataAdapter` with parameterized SQL.
- `@dash/web` MVP (in `core/`): login, register, profile, settings, admin data sources, dynamic dashboards, Apache ECharts, TanStack Table, REST API with session and hashed API tokens, and an MCP server at `/mcp`.

### Changed

- Postgres adapter connections fail after 10 seconds instead of waiting on the operating system timeout.
- Data sources admin page can add any supported source and remove any source, including the sample warehouse.
