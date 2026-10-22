import type { DashboardWidget } from "@dash/core";
import { countUsers, createUser } from "./auth.ts";
import { getDb } from "./db.ts";
import { getEnv } from "./env.ts";
import { createDashboard, listDashboards } from "./services/dashboards.ts";
import { createDataSource, listDataSources } from "./services/data-sources.ts";
import { getSettings, updateSettings } from "./services/settings.ts";

function demoWidgets(dataSourceId: string): DashboardWidget[] {
  return [
    {
      id: "kpi-revenue",
      type: "kpi",
      title: "Trailing revenue",
      layout: { x: 0, y: 0, w: 3, h: 2 },
      dataSourceId,
      query: { resource: "monthly_revenue", columns: ["revenue"] },
      kpi: { aggregation: "sum", column: "revenue", format: "currency" },
    },
    {
      id: "kpi-orders",
      type: "kpi",
      title: "Orders",
      layout: { x: 3, y: 0, w: 3, h: 2 },
      dataSourceId,
      query: { resource: "monthly_revenue", columns: ["orders"] },
      kpi: { aggregation: "sum", column: "orders", format: "number" },
    },
    {
      id: "kpi-net",
      type: "kpi",
      title: "Net new accounts",
      layout: { x: 6, y: 0, w: 3, h: 2 },
      dataSourceId,
      query: { resource: "monthly_signups", columns: ["net"] },
      kpi: { aggregation: "sum", column: "net", format: "number" },
    },
    {
      id: "kpi-arpu",
      type: "kpi",
      title: "Top SKU revenue",
      layout: { x: 9, y: 0, w: 3, h: 2 },
      dataSourceId,
      query: { resource: "product_sales", columns: ["revenue"] },
      kpi: { aggregation: "max", column: "revenue", format: "currency" },
    },
    {
      id: "chart-revenue",
      type: "chart",
      title: "Revenue by region",
      layout: { x: 0, y: 2, w: 8, h: 5 },
      dataSourceId,
      query: {
        resource: "monthly_revenue",
        columns: ["month", "region", "revenue"],
        orderBy: [{ column: "month", direction: "asc" }],
      },
      chart: {
        type: "area",
        encode: { x: "month", y: "revenue", color: "region" },
        smooth: true,
        stacked: true,
      },
    },
    {
      id: "chart-mix",
      type: "chart",
      title: "Product mix",
      layout: { x: 8, y: 2, w: 4, h: 5 },
      dataSourceId,
      query: {
        resource: "product_sales",
        columns: ["name", "revenue"],
      },
      chart: {
        type: "donut",
        encode: { name: "name", value: "revenue" },
      },
    },
    {
      id: "chart-signups",
      type: "chart",
      title: "Signups vs churn",
      layout: { x: 0, y: 7, w: 6, h: 4 },
      dataSourceId,
      query: {
        resource: "monthly_signups",
        columns: ["month", "signups", "churned"],
        orderBy: [{ column: "month", direction: "asc" }],
      },
      chart: {
        type: "line",
        encode: { x: "month", y: ["signups", "churned"] },
        smooth: true,
      },
    },
    {
      id: "chart-products",
      type: "chart",
      title: "Units by product",
      layout: { x: 6, y: 7, w: 6, h: 4 },
      dataSourceId,
      query: {
        resource: "product_sales",
        columns: ["name", "units"],
        orderBy: [{ column: "units", direction: "desc" }],
      },
      chart: {
        type: "bar",
        encode: { x: "name", y: "units" },
      },
    },
    {
      id: "table-products",
      type: "table",
      title: "Product performance",
      layout: { x: 0, y: 11, w: 12, h: 5 },
      dataSourceId,
      query: {
        resource: "product_sales",
        orderBy: [{ column: "revenue", direction: "desc" }],
      },
    },
  ];
}

let seeded = false;

export async function ensureSeeded(): Promise<void> {
  if (seeded) {
    return;
  }
  getDb();
  getSettings();
  const { seedDemo } = getEnv();
  if (!seedDemo) {
    seeded = true;
    return;
  }
  if (countUsers() === 0) {
    const admin = await createUser({
      email: "admin@dash.dev",
      name: "Dash Admin",
      password: "dashadmin",
      role: "admin",
    });
    updateSettings({ name: "Dash", allowRegistration: true });
    if (listDataSources().length === 0) {
      const source = createDataSource({
        name: "Sample warehouse",
        description: "Built-in product analytics for trying Dash without a database.",
        config: { kind: "demo" },
        createdBy: admin.id,
      });
      if (listDashboards().length === 0) {
        createDashboard({
          name: "Growth overview",
          description:
            "Revenue, acquisition, and product mix from the sample warehouse. Duplicate it or ask Dash MCP to add charts.",
          widgets: demoWidgets(source.id),
          createdBy: admin.id,
        });
      }
    }
  }
  seeded = true;
}
