# Changelog

All notable changes to Dash are documented here.

## Unreleased

### Added

- `@dash/adapter-snowflake` implementing `DataAdapter` with parameterized SQL (`?` binds) over the Snowflake HTTPS session API.
- README screenshots of sign-in, dashboards, the sample warehouse, a custom regional revenue page, the same chart inside Claude Code, API tokens, settings, and profile.
- PNPM workspace monorepo on Node.js 24 (Active LTS).
- `@dash/core` package with data-adapter types, structured queries, chart specs, dashboards, and API token helpers.
- `@dash/adapter-postgres` implementing `DataAdapter` with parameterized SQL.
- `@dash/web` MVP (in `core/`): login, register, profile, settings, admin data sources, dynamic dashboards, TanStack Charts, TanStack Table, REST API with session and hashed API tokens, and an MCP server at `/mcp`.

### Security

- Upgrade `@tanstack/react-start` to `1.168.61` (and the aligned `@tanstack/react-router@1.170.42`) so the resolved `@tanstack/start-server-core` is `1.169.40`. That clears CVE-2026-102989 / AIKIDO-2026-796907, the unauthenticated reflected XSS in TanStack Start server-function responses. `1.168.61` is the newest patched release on the current minor outside the 7-day dependency cooldown.

### Changed

- Chart widgets render with TanStack Charts (`@tanstack/charts@1.0.0`) instead of Apache ECharts. Stored `ChartSpec` documents are unchanged. That release is exempt from the 7-day dependency cooldown; the exception is version-scoped in `pnpm-workspace.yaml`.
- `/` no longer shows a marketing landing page. Signed-in visitors go to dashboards; everyone else goes to sign-in.
- README requirement is pnpm 12, matching the `package.json` pin (`12.5.1`).
- Data sources admin page can add any supported source and remove any source, including the sample warehouse.
