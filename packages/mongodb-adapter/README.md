# @dash/adapter-mongodb

MongoDB adapter for Dash. Implements `DataAdapter` from `@dash/core`.

Structured queries compile to a `find` command. Collection and field names are validated identifiers passed as document keys. Filter values are BSON scalars — objects are rejected so a client cannot inject operators such as `$gt` or `$where`. `like` and `ilike` become anchored, escaped patterns, not raw regular expressions. Discrete user and password fields are passed as driver auth options and are not interpolated into the connection URI.

Schema introspection lists up to 200 collections and samples up to 50 documents in each. MongoDB has no declared column list, so nullability reflects that sample. Field names that fail the structured-query identifier rules are omitted.

## Tests

Adapter tests connect to the local MongoDB cluster. Query compilation tests stay in-process and assert the find command before it is sent.

```bash
pnpm test:services:start
pnpm --filter @dash/adapter-mongodb test
```

Default URL: `mongodb://dash:dash@127.0.0.1:27029/dash?authSource=admin`. Fixture collections `orders` and `revenue`, plus the `paid_orders` view, are created by `docker/mongodb/init`.
