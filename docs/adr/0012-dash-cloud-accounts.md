# ADR 0012: Dash Cloud accounts in the public website

## Status

Accepted. Changes the static export in [ADR 0011](0011-public-website.md).

## Context

Dash Cloud is the paid, hosted Dash service. The owner decided that Dash Cloud runs in the public website (`@dash/site`), not on a separate host. Visitors create an account at `/register/` and sign in at `/login/`.

A Cloud customer is a team. One person creates the account, and that person owns an organization on the Cloud plan. A later change provisions the hosted Dash workspace for the organization and adds billing.

The product app (`@dash/web`) already has accounts. It hashes passwords with scrypt and keeps a SHA-256 of each session token in MongoDB ([ADR 0003](0003-api-tokens.md), [ADR 0007](0007-mongodb-app-state.md)). The app has no limit on failed sign-ins.

## Decision

- The website stops using `output: "export"`. `next build` makes a Node.js server, and `pnpm --filter @dash/site start` runs it. The marketing pages stay static. Only `/account/` reads the session for each request.
- Accounts live in MongoDB with the `mongodb` driver that `@dash/web` uses. `DASH_CLOUD_MONGODB_URI` names the database. It is a separate database from the app state of any Dash instance.
- Collections:
  - `accounts`: name, lowercase email with a unique index, password hash, organization id, and role `owner`.
  - `organizations`: name, plan `cloud`, and the owner account id.
  - `sessions`: SHA-256 of the token, account id, and expiry. A TTL index removes expired sessions.
  - `login_throttle`: sign-in attempts for each email. A TTL index removes a record after 15 minutes.
- Passwords use scrypt in the format of `@dash/web` (`scrypt$N$r$p$salt$hash`). The website calls the async `scrypt`, so a hash does not block other requests. A password has 8 to 200 characters.
- A sign-in with an unknown email compares the password against a dummy hash. The time of the response then does not show if an account exists. Both failures show the same message.
- Each sign-in reserves one of 10 attempts for its email in a 15-minute window, before the password check. The reservation is one conditional MongoDB update, so concurrent requests cannot get more attempts. A correct sign-in resets the count. After 10 failures in a row, Dash Cloud refuses sign-in for that email until the window ends.
- The session token is 32 random bytes in the `dash_cloud_session` cookie. The cookie is `HttpOnly` and `SameSite=Lax`, and it is `Secure` in production. A session lasts 30 days.
- The forms call Next.js server actions. zod validates the input on the server. Next.js compares the `Origin` header with the host for each server action, which blocks cross-site form posts.
- MongoDB on a single node has no transactions. Sign-up writes the account and then the organization. If the organization write fails, sign-up deletes the account.

## Consequences

- A static host cannot serve the website now. The website needs a Node.js host and a MongoDB database. This change does not add a deploy.
- The service tests use the MongoDB test cluster from [ADR 0005](0005-adapter-test-clusters.md).
- An attacker who knows an email can lock that email for 15 minutes. A later change can add a limit for each client address.
- There is no password reset and no email verification yet. A later change adds them with an email provider.
- A Cloud account does not yet open a hosted Dash workspace. The account page shows the account and its organization.
