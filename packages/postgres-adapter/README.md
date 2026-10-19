# @dash/adapter-postgres

PostgreSQL adapter for Dash. Implements `DataAdapter` from `@dash/core`.

Structured queries compile to parameterized SQL (`$1`, `$2`, …). Resource and column names are quoted after identifier validation — client input is never concatenated into SQL.
