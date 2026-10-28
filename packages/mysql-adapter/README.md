# @dash/adapter-mysql

MySQL adapter for Dash. Implements `DataAdapter` from `@dash/core`.

Structured queries compile to parameterized SQL (`?` placeholders). Resource and column names are backtick-quoted after identifier validation — client input is never concatenated into SQL. `like` uses `COLLATE utf8mb4_bin` so it stays case-sensitive on the default `ai_ci` collation. `ilike` compiles to `LOWER(column) LIKE LOWER(?)` because MySQL has no `ILIKE`. Connection URIs are parsed in-process; only host, port, user, password, database, and SSL reach the driver.

## Tests

Adapter tests connect to the local MySQL cluster. SQL compilation tests stay in-process and assert the parameterized statement before it is sent.

```bash
pnpm test:services:start
pnpm --filter @dash/adapter-mysql test
```

Default URL: `mysql://dash:dash@127.0.0.1:33029/dash`. Fixture tables `orders`, `revenue`, and `metrics`, plus the `paid_orders` view, are created by `docker/mysql/init`.
