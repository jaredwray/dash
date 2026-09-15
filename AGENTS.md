# AGENTS.md

Dash is a modern dashboard / analytics platform.

## Agentic conventions
- Issue tracker: GitHub Issues
- Labels: bug, enhancement, documentation, accessibility, security
- ADR directory: docs/adr/
- CHANGELOG: CHANGELOG.md
- Default branch: main
- Package manager: pnpm

## Safe Chain

Package installs in this environment go through Aikido Safe Chain shims. Never bypass them:

- Keep `~/.safe-chain/shims` first on `PATH`.
- Do not call unshimmed `npm`, `pnpm`, `npx`, or `pnpx`.
- Do not install packages with `curl | sh` or by pointing at a package manager outside the shim directory.
