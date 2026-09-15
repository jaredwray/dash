# Changelog

All notable changes to Dash are documented here.

## Unreleased

### Added

- PNPM workspace monorepo on Node.js 24 (Active LTS).
- `@dash/core` package with data-adapter types, structured queries, chart specs, dashboards, and API token helpers.
- `@dash/adapter-postgres` implementing `DataAdapter` with parameterized SQL.
- `@dash/web` MVP (in `core/`): login, register, profile, settings, admin data sources, dynamic dashboards, Apache ECharts, TanStack Table, REST API with session and hashed API tokens, and an MCP server at `/mcp`.

### Changed

- Data sources admin page can add any supported source and remove any source, including the sample warehouse.
