# ADR 0013: The app on demo.dash.io and the website on dev.dash.io

## Status

Accepted. Changes the host of the app in [ADR 0006](0006-dev-workers-container.md). Adds the website deploy that [ADR 0012](0012-dash-cloud-accounts.md) did not include.

## Context

The app (`@dash/web`) was on `dev.dash.io`. The public website (`@dash/site`) had no deploy. The owner decided that `demo.dash.io` shows the app and that `dev.dash.io` shows the development copy of the website.

The website is a Next.js server on Node.js ([ADR 0012](0012-dash-cloud-accounts.md)). Cloudflare Workers cannot run that server directly. The app already uses a Worker in front of a container ([ADR 0006](0006-dev-workers-container.md)), and the website can use the same design.

## Decision

- `wrangler.jsonc` attaches the app Worker to the custom domain `demo.dash.io`. The Worker keeps the name `dash-development`, its container, and its secrets. The move needs no manual step.
- The website has a second Worker, `dash-site-development`. Its config is `wrangler.site.jsonc`. The Worker has the custom domain `dev.dash.io`, and `workers.dev` is off.
- The Worker entry is `packages/container-worker/src/site.ts`. One container class, `SiteContainer`, runs the image from `Dockerfile.site`. `max_instances` is 1, the instance type is `basic`, and the container listens on port 3000. Each request uses the instance with the name `dev`.
- `Dockerfile.site` builds with `DASH_SITE_OUTPUT=standalone`. `next.config.ts` then sets `output: "standalone"`, and `next build` writes `.next/standalone/`. That directory is a server with only the files that it needs. The image runs `node packages/site/server.js`. A build without the variable does not change, so `pnpm --filter @dash/site start` operates as before.
- `outputFileTracingRoot` is the repo root, because pnpm keeps the dependencies there.
- `DASH_CLOUD_MONGODB_URI` is a Worker secret of `dash-site-development`. The Worker copies it into the container environment when the instance starts. The secret is not in the image, in a Wrangler var, or in GitHub Actions. The Worker does not block a request when the secret is not set, because the marketing pages work without it.
- The Worker adds `X-Robots-Tag: noindex, nofollow` to each response. Search engines then do not index the development copy of the website.
- Next.js exits with code 143 after SIGTERM. The Worker logs that exit as `container stopped`. A different non-zero exit code is `container crashed`.
- Cloudflare logs are on for the Worker and the container, as for the app.
- There are two workflows. `deploy-demo` deploys the app, and `deploy-dev` deploys the website. Each workflow runs on a push to `main` and on `workflow_dispatch`. A manual run can select a branch, so the deploy job runs only when the ref is `main`. The scripts are `pnpm deploy:demo` and `pnpm deploy:dev`.

## Consequences

- `dev.dash.io` does not show the app after the first deploy. A link to an app page on `dev.dash.io` opens the website. A session cookie for `dev.dash.io` does not apply to `demo.dash.io`, so each app user signs in again.
- The first deploy moves the two custom domains. In GitHub Actions, Wrangler moves a custom domain to a different Worker without a prompt. Thus the sequence of the two workflows is not important.
- A Cloudflare Access policy for `dev.dash.io` now applies to the website. If the app must not be public, add a policy for `demo.dash.io`. Cloudflare Access is not in this repository.
- Sign-up and sign-in on `dev.dash.io` show an error message until the owner sets `DASH_CLOUD_MONGODB_URI`. The marketing pages work immediately.
- The Worker name `dash-development` does not agree with the host `demo.dash.io`. A new name makes a new Worker that has no secrets, and the old Worker stays until someone deletes it. A later change can give the Worker a new name.
- The demo user is not seeded on `demo.dash.io`. `DASH_SEED_DEMO` stays `false`.
- CI does not build the two images. The deploy workflows build them after the merge.
