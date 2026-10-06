# ADR 0004: TanStack Charts

## Status

Accepted

## Context

[ADR 0002](0002-charting-library.md) rendered `ChartSpec` with Apache ECharts. Dash already builds the rest of the product on TanStack Start, Router, Query, and Table. TanStack Charts is the chart grammar for that stack, and agents still need a JSON spec rather than a renderer option blob.

## Decision

- Keep `ChartSpec` in `@dash/core` (type, encode, stacked, smooth). Stored dashboard documents do not change.
- Render charts in `@dash/web` with `@tanstack/charts` and the React adapter (`@tanstack/charts/react`).
- Depend on `@tanstack/charts@1.0.0`. That release was still inside the 7-day cooldown on 2026-10-06, so `pnpm-workspace.yaml` exempts this version only (`minimumReleaseAgeExclude`). Later Charts releases stay subject to the cooldown.
- Map `ChartSpec` types onto those marks: smooth lines and areas use a monotone curve, `stacked` uses the stack layout, `bar` is horizontal, and pie/donut charts are polar arcs.

## Consequences

MCP clients keep emitting `ChartSpec` JSON. The cooldown exception is the single version `@tanstack/charts@1.0.0`.
