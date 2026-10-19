# Changelog

All notable changes to Dash are documented here.

## Unreleased

### Added

- README screenshots of sign-in, dashboards, the sample warehouse, a custom regional revenue page, the same chart inside Claude Code, API tokens, settings, and profile.
- PNPM workspace monorepo on Node.js 24 (Active LTS).
- `@dash/core` package with data-adapter types, structured queries, chart specs, dashboards, and API token helpers.
- `@dash/adapter-postgres` implementing `DataAdapter` with parameterized SQL.
- `@dash/web` MVP (in `packages/web`): login, register, profile, settings, admin data sources, dynamic dashboards, TanStack Charts, TanStack Table, REST API with session and hashed API tokens, and an MCP server at `/mcp`.

### Changed

- `@dash/web` moved from `core/` to `packages/web`. `@dash/adapter-postgres` moved from `data-adapters/postgres` to `packages/postgres-adapter`. The root `pnpm-workspace.yaml` lists `packages/*`. A database left at `core/data/dash.sqlite` is moved to the web package data directory on startup when the default `DASH_DATABASE_PATH` is still in use.
- Security: `@tanstack/react-start` 1.168.56 → 1.168.61 (with aligned `@tanstack/react-router` 1.170.42 and `@tanstack/start-server-core` 1.169.40), `zod` 4.6.5 → 4.6.6, and `source-map-js` 1.2.1 → 1.2.2.
- Chart widgets render with TanStack Charts (`@tanstack/charts@1.0.0`) instead of Apache ECharts. Stored `ChartSpec` documents are unchanged. That release is exempt from the 7-day dependency cooldown; the exception is version-scoped in `pnpm-workspace.yaml`.
- `/` no longer shows a marketing landing page. Signed-in visitors go to dashboards; everyone else goes to sign-in.
- README requirement is pnpm 12, matching the `package.json` pin (`12.5.1`).
- Data sources admin page can add any supported source and remove any source, including the sample warehouse.
