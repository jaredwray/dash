# ADR 0005: Adapter tests use local clusters

## Status

Accepted

## Context

Warehouse adapters compile structured queries into engine-specific calls. Mock clients can assert that a method was invoked, and they miss dialect behavior: parameter binding, `ILIKE`, views, and the types the driver returns.

## Decision

- Docker Compose (`docker-compose.test.yml`) runs one local cluster per warehouse adapter.
- `pnpm test:services:start` brings the clusters up and waits until they are healthy. `pnpm test:services:stop` removes them and their volumes.
- Tests in `packages/postgres-adapter` that talk to Postgres use that cluster. The in-process demo adapter is not a cluster.
- SQL string compilation stays unit-tested. Executing that SQL is covered by the cluster tests.
- CI starts the clusters before `pnpm test` and always stops them afterward.

## Consequences

`pnpm test` needs Docker running and the clusters started. A down cluster fails the adapter suite with a message that points at `pnpm test:services:start`. The next adapter adds a service to the same Compose file instead of a new harness.
