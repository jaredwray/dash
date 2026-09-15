# ADR 0002: Apache ECharts

## Status

Accepted

## Context

Dash needs charts that look production-grade and that agents can create. Tableau-like products fail when the grammar is not JSON and the renderer is not flexible.

## Decision

- Domain layer: `ChartSpec` in `@dash/core` (type, encode, stacked, smooth).
- Renderer: Apache ECharts in `@dash/web`, converted from `ChartSpec`.
- Tables: TanStack Table for sort and filter, matching the rest of the TanStack stack.

## Consequences

MCP clients emit `ChartSpec` JSON rather than ECharts option blobs. Replacing the renderer later does not change the stored dashboard documents.
