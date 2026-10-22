# @dash/adapter-snowflake

Snowflake adapter for Dash. Implements `DataAdapter` from `@dash/core`.

Structured queries compile to parameterized SQL (`?` binds), including `IDENTIFIER(?)` for resource and column names. The adapter talks to Snowflake over HTTPS (`*.snowflakecomputing.com` only) and does not pull in `snowflake-sdk`.
