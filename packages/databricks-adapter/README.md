# @dash/adapter-databricks

Databricks SQL adapter for Dash. Implements `DataAdapter` from `@dash/core`.

Structured queries compile to Databricks SQL with named parameters (`:p0`, `:p1`, …). `LIMIT` and `OFFSET` are integer literals. Resource names may be `schema.table` or `catalog.schema.table`, and identifiers may include hyphens. String comparisons cast the column to `VARCHAR` so date and numeric columns can be filtered as text. A null `eq` or `neq` filter becomes `IS NULL` or `IS NOT NULL`.

The adapter talks to the SQL Statement Execution API (`POST /api/2.0/sql/statements`). A personal access token is sent as `Authorization: Bearer` only to the configured workspace host. Redirects are not followed, external result links are refused, and `http` is allowed only for a loopback host. Closing the client or timing out cancels the warehouse statement.

The data-source form accepts `databricks://token:<pat>@<workspace-host>/sql/1.0/warehouses/<id>?catalog=main&schema=default`. Legacy SQL endpoints use `/sql/1.0/endpoints/<id>`. A loopback host with a port uses `http`. Every other host uses `https`. Explicit fields override the same fields in a connection string.

## Tests

SQL compilation tests stay in-process. Adapter tests connect to the local cluster, a 512 MiB Statement Execution API backed by DuckDB.

```bash
pnpm test:services:start
pnpm --filter @dash/adapter-databricks test
```

Default endpoint: `http://127.0.0.1:14439`, token `dash`, warehouse `dash`, catalog `dash`, schema `analytics`. Fixture tables `orders` and `revenue`, and the `paid_orders` view, are created when the container starts.
