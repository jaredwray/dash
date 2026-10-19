# Data adapters

Each warehouse adapter is its own package under `packages/` and implements
`DataAdapter` from `@dash/core`. Postgres ships as `packages/postgres-adapter`
(`@dash/adapter-postgres`).

## Shipping

| Package | Directory | Kind | Status |
| --- | --- | --- | --- |
| `@dash/adapter-postgres` | `packages/postgres-adapter` | `postgres` | MVP |
| — | — | `mysql` | Planned |
| — | — | `mongodb` | Planned |
| — | — | `bigquery` | Planned |
| — | — | `snowflake` | Planned |
| — | — | `redshift` | Planned |
| — | — | `clickhouse` | Planned |

The web app also ships a built-in `demo` adapter so the product is usable
without an external warehouse.

## Adding an adapter

1. Create `packages/<name>-adapter` with a `package.json` that depends on `@dash/core`.
2. Implement `DataAdapter` (`testConnection`, `introspectSchema`, `query`, `close`).
3. Compile structured `AdapterQuery` values with bound parameters — never
   interpolate identifiers or literals from the client without validation.
4. Register the factory in `packages/web/src/server/adapters/registry.ts`.
5. Check the new item off in the root README feature checklist.
