# ADR 0008: Team members and invitations

## Status

Accepted

## Context

Accounts could only be created through open registration. A workspace that turned registration off had no way to add a person, and there was no page listing who had access or a way to change anyone's role. Dash does not send email.

## Decision

- Roles stay `admin` and `member`. The UI labels `member` as **User**. Keeping the stored value avoids a data migration and leaves `role` in `/api/auth/me` unchanged for API clients.
- Every signed-in person can list members (`GET /api/members`, `read` scope). Inviting, revoking, and changing roles are admin-only and require a browser session. An API token cannot do them, even an admin's, so a leaked token cannot mint accounts or promote one. This matches token management in [ADR 0003](0003-api-tokens.md).
- An invitation is a single-use link. The token is 32 random bytes, returned once, and stored as SHA-256. It expires after 7 days. Accepting it creates the account with the invited email and role and works while open registration is off.
- The link carries the token in the URL fragment (`/invite#<token>`). Browsers do not send the fragment to the server or in `Referer`, so it stays out of access logs. The page posts the token in a request body to `POST /api/auth/invitation` (preview) and `POST /api/auth/invitation/accept`.
- One open invitation per email, enforced by a partial unique index on `email` where `status` is `pending`. Inviting the same address again replaces the open invitation: the old link stops working, and the new role and expiry apply. Inviting an address that already has an account is refused.
- Acceptance claims the invitation with a conditional update before creating the account, so a link opened twice creates at most one user. If the account cannot be created, the claim is released.
- The workspace keeps at least one admin. A demotion is checked after the write and reverted if no admin remains. Two admins demoting each other at once end with at least one admin.

## Consequences

An admin shares the link through their own channel. Anyone holding a live link can create that account, so links are short-lived, single-use, and revocable from the Team page. Removing a member is not part of this change.
