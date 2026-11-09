# ADR 0011: Public website in a separate Next.js package

## Status

Accepted.

## Context

Dash needs a public website. The website must say two things:

- Dash is open source under the MIT license, and anyone can host it for free.
- Dash Cloud is a paid, hosted Dash service for teams that do not want to operate it.

The product app (`@dash/web`) is a TanStack Start server. It needs MongoDB and a secret at runtime. A marketing page must not depend on that server, its database, or its deploy.

## Decision

- A new package, `packages/site` (`@dash/site`), holds the website.
- The stack is Next.js (App Router), React, Tailwind CSS, Biome, and Vitest. The package manager is pnpm, as in the rest of the monorepo.
- `next.config.ts` sets `output: "export"`. `next build` writes static HTML, CSS, and images to `packages/site/out/`. The website has no server code, so any static host can serve it.
- `trailingSlash` is `true`. Each page is a directory with an `index.html` file, which static hosts serve without rewrite rules.
- Biome lints and formats `packages/site` only. The configuration is `packages/site/biome.json`. The other packages keep their current tools. A later change can extend Biome to them.
- `pnpm typecheck` runs `next typegen` before `tsc --noEmit`, because `next-env.d.ts` imports the generated route types. `next-env.d.ts` is not in Git.
- Links to the repository, to Dash Cloud, and to the contact address are constants in `src/lib/site.ts`. Plan names, prices, and features are typed data in one file, so a price change does not touch a component.
- The website uses the app color tokens and the Outfit font, so the website and the product look like one brand.
- The website uses WebP copies of five README screenshots in `packages/site/public/screenshots/`. The copies are 2400 pixels wide. The four screenshots on the home page are about 0.5 MB, not 1.9 MB.
- CI runs `pnpm lint` and `pnpm --filter @dash/site build`. `pnpm typecheck` and `pnpm test` already include the new package.

## Consequences

- The website builds and deploys apart from the app. A website change cannot break the app container.
- This change does not add a deploy for the website. A later change selects the host and adds a workflow.
- The Dash Cloud prices and the `app.dash.io` and `hello@dash.io` addresses are placeholders. The owner must confirm them before launch.
- The screenshot copies do not update when the README screenshots change. Convert them again after a new README capture.
