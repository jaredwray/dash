# @dash/adapter-redshift

Amazon Redshift adapter for Dash. Implements `DataAdapter` from `@dash/core`.

Redshift speaks the PostgreSQL wire protocol, so this adapter uses `pg` and compiles structured queries to parameterized SQL (`$1`, `$2`, …). Resource and column names are quoted after identifier validation.

Connection strings are parsed in-process. Only `ssl` and `sslmode` are accepted. Encryption is the default. `sslmode=require` and `verify-ca` check the certificate chain and skip the host name, so a CNAME can still present Amazon's certificate. `verify-full` also checks the host name. An explicit `ssl` flag turns encryption on or off over the URI. Driver options such as `options` are rejected. Queries time out after 60 seconds. The password is never placed on the public summary.

## Tests

SQL and connection-string tests stay in-process. Adapter tests connect to the local cluster, a PostgreSQL stand-in for the Redshift wire protocol.

```bash
pnpm test:services:start
pnpm --filter @dash/adapter-redshift test
```

Default cluster: `redshift://dash:dash@127.0.0.1:54399/dash`. Fixture tables `orders` and `revenue`, plus the `paid_orders` view, are created by `docker/redshift/init`.
