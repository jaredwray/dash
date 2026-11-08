# @dash/seed

Development seed data for Dash. This package generates Fernway, Inc., a fictional B2B SaaS company, and writes it into configured data sources. The web app uses it from **Settings → Sample company data** when `DASH_SEED_DEV_SOURCES=true` outside production.

## Parts

- `generateDataset({ asOf, size, seed })` returns seven domains: product database, billing, sales CRM, finance warehouse, product analytics, marketing analytics, and customer support. The output is a pure function of its options.
- `planSeed(sources, size)` gives each domain a target source by kind preference.
- `buildDashboards(asOf, resolve)` turns the dashboard specs into Dash widgets for the targets.
- `createSeedWriter(config)` returns a writer for Postgres, MongoDB, or BigQuery. Each writer refuses a target that it did not create.

## Tests

The generator, plan, and dashboard tests need no services. The writer tests use the Compose clusters:

```bash
pnpm test:services:start
pnpm --filter @dash/seed test
```

See the root README and [ADR 0010](../../docs/adr/0010-dev-seed-data-sources.md).
