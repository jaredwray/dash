# ADR 0003: REST auth and API tokens

## Status

Accepted

## Context

The product must authenticate people in the browser and machines (MCP, scripts) over the same REST API.

## Decision

- Browser sessions: opaque token in an `HttpOnly` `SameSite=Lax` cookie. Only the SHA-256 of the token is stored.
- Passwords: scrypt (Node `crypto`) with a random salt.
- API tokens: `dash_live_` + 32 random bytes, shown once. Stored as SHA-256. Compared with `timingSafeEqual`. Scoped (`read`, `write`, `mcp`), optional expiry, revocable, last-used timestamp.
- Data-source secrets: AES-256-GCM using a key derived from `DASH_SECRET`.
- Queries: structured `AdapterQuery` only. Adapters bind values; identifiers are allowlisted.

Token create/revoke requires a session, not another API token.
