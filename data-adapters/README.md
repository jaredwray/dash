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
without an external warehouse.

## Adding an adapter

1. Create `data-adapters/<name>` with a `package.json` that depends on `@dash/core`.
2. Implement `DataAdapter` (`testConnection`, `introspectSchema`, `query`, `close`).
3. Compile structured `AdapterQuery` values with bound parameters — never
   interpolate identifiers or literals from the client without validation.
4. Register the factory in `core/src/server/adapters/registry.ts`.
5. Check the new item off in the root README feature checklist.
