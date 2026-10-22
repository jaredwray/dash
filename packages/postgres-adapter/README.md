# @dash/adapter-postgres

PostgreSQL adapter for Dash. Implements `DataAdapter` from `@dash/core`.

Structured queries compile to parameterized SQL (`$1`, `$2`, …). Resource and column names are quoted after identifier validation — client input is never concatenated into SQL.

## Tests

Adapter tests connect to the local Postgres cluster. SQL compilation tests stay in-process and assert the parameterized statement before it is sent.

```bash
pnpm test:services:start
pnpm --filter @dash/adapter-postgres test
```

Default URL: `postgres://dash:dash@127.0.0.1:54329/dash`. Fixture tables `orders` and `revenue`, plus the `paid_orders` view, are created by `docker/postgres/init`.
