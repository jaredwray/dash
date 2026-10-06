# ADR 0004: TanStack Charts

## Status

Accepted

## Context

[ADR 0002](0002-charting-library.md) rendered `ChartSpec` with Apache ECharts. Dash already builds the rest of the product on TanStack Start, Router, Query, and Table. TanStack Charts is the chart grammar for that stack, and agents still need a JSON spec rather than a renderer option blob.

## Decision

- Keep `ChartSpec` in `@dash/core` (type, encode, stacked, smooth). Stored dashboard documents do not change.
- Render charts in `@dash/web` with `@tanstack/charts` and the React adapter (`@tanstack/charts/react`).
- Pin `@tanstack/charts@0.18.0`. That is the newest release outside the 7-day dependency cooldown. Charts `1.0.0` (published 2026-10-03) stays blocked until the cooldown passes. The marks this app uses (`lineY`, `areaY`, `barX`, `barY`, `dot`, `polar` / `radialArc`) match the 1.0 surface.
- Map `ChartSpec` types onto those marks: smooth lines and areas use a monotone curve, `stacked` uses the stack layout, `bar` is horizontal, and pie/donut charts are polar arcs.

## Consequences

MCP clients keep emitting `ChartSpec` JSON. A bump to Charts 1.x waits until that release clears `minimumReleaseAge`.
