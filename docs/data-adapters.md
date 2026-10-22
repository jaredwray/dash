# Data adapters

Each warehouse adapter is its own package under `packages/` and implements
`DataAdapter` from `@dash/core`. Postgres ships as `packages/postgres-adapter`
(`@dash/adapter-postgres`). Snowflake ships as `packages/snowflake-adapter`
(`@dash/adapter-snowflake`).

## Shipping

| Package | Directory | Kind | Status |
| --- | --- | --- | --- |
| `@dash/adapter-postgres` | `packages/postgres-adapter` | `postgres` | MVP |
| `@dash/adapter-snowflake` | `packages/snowflake-adapter` | `snowflake` | MVP |
| — | — | `mysql` | Planned |
| — | — | `mongodb` | Planned |
| — | — | `bigquery` | Planned |
| — | — | `redshift` | Planned |
| — | — | `clickhouse` | Planned |

The web app also ships a built-in `demo` adapter so the product is usable
without an external warehouse. The demo adapter stays in-process.

## Testing

Postgres adapter tests run against the local cluster in `docker-compose.test.yml`.

```bash
pnpm test:services:start
pnpm test
pnpm test:services:stop
```

The cluster listens on `127.0.0.1:54329` (`dash` / `dash`, database `dash`).
The root README lists the environment overrides. When an engine can run
locally, add it to that Compose file and point the package tests at it.

## Adding an adapter

1. Create `packages/<name>-adapter` with a `package.json` that depends on `@dash/core`.
2. Implement `DataAdapter` (`testConnection`, `introspectSchema`, `query`, `close`).
3. Compile structured `AdapterQuery` values with bound parameters — never
   interpolate identifiers or literals from the client without validation.
4. Register the factory in `packages/web/src/server/adapters/registry.ts`.
5. When the engine can run locally, add it to `docker-compose.test.yml` and
   run the adapter tests against that cluster.
6. Check the new item off in the root README feature checklist.
