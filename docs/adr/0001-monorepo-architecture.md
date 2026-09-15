# ADR 0001: PNPM monorepo layout

## Status

Accepted

## Context

Dash needs a single TypeScript codebase for the product UI, REST API, and MCP server, plus reusable types that every warehouse adapter can implement independently.

## Decision

- Node.js 24 (Active LTS) and PNPM workspaces.
- `core/` is the website (`@dash/web`) — TanStack Start hosts UX, REST routes, and MCP together.
- `packages/core` (`@dash/core`) holds adapter and domain types only.
- `data-adapters/*` holds one package per warehouse. Postgres ships first.

## Consequences

Adapters can be added without rewriting the app. The website depends on `@dash/core` and the adapters it currently hosts. New adapters register in `core/src/server/adapters/registry.ts`.
