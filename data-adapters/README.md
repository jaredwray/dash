# Data adapters

Each adapter lives in its own package under `data-adapters/` and implements
`DataAdapter` from `@dash/core`.

## Shipping

| Package | Kind | Status |
| --- | --- | --- |
| `@dash/adapter-postgres` | `postgres` | MVP |
| — | `mysql` | Planned |
| — | `mongodb` | Planned |
| — | `bigquery` | Planned |
| — | `snowflake` | Planned |
| — | `redshift` | Planned |
| — | `clickhouse` | Planned |

The web app also ships a built-in `demo` adapter so the product is usable
without an external warehouse. The demo adapter stays in-process. Every
warehouse adapter test runs against a real cluster.

## Testing

From the repo root:

```bash
pnpm test:services:start
pnpm test
pnpm test:services:stop
```

`docker-compose.test.yml` publishes the Postgres cluster at
`127.0.0.1:54329` (`dash` / `dash`, database `dash`). See the root README
for environment overrides. When you add an adapter, add its cluster to that
Compose file and point the package tests at it.

## Adding an adapter

1. Create `data-adapters/<name>` with a `package.json` that depends on `@dash/core`.
2. Implement `DataAdapter` (`testConnection`, `introspectSchema`, `query`, `close`).
3. Compile structured `AdapterQuery` values with bound parameters — never
   interpolate identifiers or literals from the client without validation.
4. Register the factory in `core/src/server/adapters/registry.ts`.
5. Add the engine to `docker-compose.test.yml` and run the adapter tests
   against that cluster.
6. Check the new item off in the root README feature checklist.
