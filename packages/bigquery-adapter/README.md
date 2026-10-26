# @dash/adapter-bigquery

Google BigQuery adapter for Dash. Implements `DataAdapter` from `@dash/core`.

Structured queries compile to GoogleSQL with named parameters (`@p0`, `@p1`, …). Resource and column names are backtick-quoted after identifier validation. `ilike` is `LOWER(CAST(column AS STRING)) LIKE LOWER(CAST(@p AS STRING))` because GoogleSQL has no `ILIKE`. A null `eq` or `neq` filter becomes `IS NULL` or `IS NOT NULL`.

The adapter talks to the BigQuery jobs API over HTTP. A service account key (`client_email` and `private_key`) is signed locally and exchanged at `oauth2.googleapis.com`. The access token is sent only to `*.googleapis.com`. `GOOGLE_APPLICATION_CREDENTIALS` and the GCE metadata server are used when no key is stored on the data source. An emulator origin such as `http://127.0.0.1:9059` is called without credentials.

## Tests

SQL compilation tests stay in-process. Adapter tests connect to the local BigQuery emulator, a 256 MiB in-memory micro instance.

```bash
pnpm test:services:start
pnpm --filter @dash/adapter-bigquery test
```

Default endpoint: `http://127.0.0.1:9059`, project `dash`, dataset `analytics`. Fixture tables `orders` and `revenue` come from `docker/bigquery/seed.yaml`. The `paid_orders` view is created when the container starts.
