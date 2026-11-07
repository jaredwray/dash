import { describe, expect, it } from "vitest";
import type { AdapterFilter } from "@dash/core";
import { buildDashboards, dashboardSpecs } from "./dashboards.ts";
import { generateDataset } from "./generate.ts";
import type { SeedTable } from "./table.ts";

const AS_OF = new Date("2026-11-01T00:00:00.000Z");
const dataset = generateDataset({ asOf: AS_OF, size: "small" });
const tables = new Map<string, SeedTable>();
for (const domain of dataset.domains) {
  for (const table of domain.tables) tables.set(`${domain.key}.${table.name}`, table);
}

function matches(row: Record<string, unknown>, filter: AdapterFilter): boolean {
  const value = row[filter.column];
  const target = filter.value;
  switch (filter.op) {
    case "eq":
      return value === target;
    case "gt":
      return (value as number | string) > (target as number | string);
    case "gte":
      return (value as number | string) >= (target as number | string);
    case "in":
      return (target as unknown[]).includes(value);
    default:
      throw new Error(`The test has no evaluator for ${filter.op}`);
  }
}

describe("dashboard specs", () => {
  it("only name tables and columns that the dataset has, and each widget gets rows", () => {
    for (const spec of dashboardSpecs(AS_OF)) {
      for (const widget of spec.widgets) {
        const where = `${spec.key}/${widget.id}`;
        const table = tables.get(`${widget.domain}.${widget.table}`);
        expect(table, where).toBeDefined();
        const columns = new Set(table!.columns.map((column) => column.name));
        const named = [
          ...(widget.query?.columns ?? []),
          ...(widget.query?.filters ?? []).map((filter) => filter.column),
          ...(widget.query?.orderBy ?? []).map((order) => order.column),
          ...(widget.kpi ? [widget.kpi.column] : []),
          ...Object.values(widget.chart?.encode ?? {}).flat(),
        ];
        for (const name of named) expect(columns.has(name), `${where} uses ${name}`).toBe(true);
        const rows = table!.rows.filter((row) => (widget.query?.filters ?? []).every((filter) => matches(row, filter)));
        expect(rows.length, `${where} has no rows`).toBeGreaterThan(0);
        if (widget.kpi && widget.kpi.aggregation !== "count") {
          expect(rows.some((row) => row[widget.kpi!.column] !== null), `${where} KPI is empty`).toBe(true);
        }
      }
    }
  });

  it("places widgets in the 12-column grid without overlap", () => {
    for (const spec of dashboardSpecs(AS_OF)) {
      const cells = new Set<string>();
      for (const widget of spec.widgets) {
        const { x, y, w, h } = widget.layout;
        expect(x + w, `${spec.key}/${widget.id}`).toBeLessThanOrEqual(12);
        for (let column = x; column < x + w; column += 1) {
          for (let row = y; row < y + h; row += 1) {
            const cell = `${column},${row}`;
            expect(cells.has(cell), `${spec.key}/${widget.id} overlaps at ${cell}`).toBe(false);
            cells.add(cell);
          }
        }
      }
    }
  });

  it("resolves each widget to its source and drops widgets and dashboards without one", () => {
    const all = buildDashboards(AS_OF, (domain, table) => ({ dataSourceId: `src-${domain}`, resource: `fernway_${domain}.${table}` }));
    expect(all.map((dashboard) => dashboard.key)).toEqual(["executive", "revenue", "sales", "product", "marketing", "support"]);
    const top = all[0]!.widgets.find((widget) => widget.id === "exec-top")!;
    expect(top.dataSourceId).toBe("src-billing");
    expect(top.query.resource).toBe("fernway_billing.mart_top_accounts");

    const supportOnly = buildDashboards(AS_OF, (domain, table) => (domain === "support" ? { dataSourceId: "mongo", resource: `support_${table}` } : null));
    expect(supportOnly.map((dashboard) => dashboard.key)).toEqual(["support"]);
    expect(supportOnly[0]!.widgets.every((widget) => widget.dataSourceId === "mongo")).toBe(true);
  });
});
