import type { DashboardWidget } from "@dash/core";
import { EmailTakenError, countUsers, createUser, findUserByEmail, grantInitialAdmin } from "./auth.ts";
import { ensurePersonalWorkspace } from "./services/workspaces.ts";
import { getDb } from "./db.ts";
import { getEnv } from "./env.ts";
import { createDashboard, listDashboards } from "./services/dashboards.ts";
import { createDataSource, listDataSources } from "./services/data-sources.ts";
import { getSettings, updateSettings } from "./services/settings.ts";

export const DEMO_LOGIN = {
  email: "admin@dash.dev",
  password: "dashadmin",
} as const;

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

let seedTask: Promise<void> | undefined;

export function resetSeedForTests(): void {
  seedTask = undefined;
}

async function seedOnce(): Promise<void> {
  const db = await getDb();
  await getSettings();
  if (!getEnv().seedDemo) return;
  const progress = db.collection<{ _id: string; complete: boolean }>("settings");
  let state = await progress.findOne({ _id: "demo-seed" });
  if (!state) {
    if ((await countUsers()) !== 0) return;
    await progress.updateOne(
      { _id: "demo-seed" },
      { $setOnInsert: { complete: false } },
      { upsert: true },
    );
    state = await progress.findOne({ _id: "demo-seed" });
  }
  if (state?.complete) return;

  // Resume each step after a failed request or a server restart.
  let admin = await findUserByEmail(DEMO_LOGIN.email);
  if (!admin) {
    try {
      await createUser({
        email: DEMO_LOGIN.email,
        name: "Dash Admin",
        password: DEMO_LOGIN.password,
        role: "member",
      });
    } catch (error) {
      if (!(error instanceof EmailTakenError)) throw error;
    }
    admin = await findUserByEmail(DEMO_LOGIN.email);
  }
  if (!admin) throw new Error("Demo account not found");
  await grantInitialAdmin(admin._id);
  const workspaceId = await ensurePersonalWorkspace(admin._id);
  await updateSettings({ name: "Dash", allowRegistration: true });
  const source =
    (await listDataSources()).find((item) => item.kind === "demo") ??
    (await createDataSource({
      name: "Sample warehouse",
      description: "Built-in product analytics for trying Dash without a database.",
      config: { kind: "demo" },
      createdBy: admin._id,
    }));
  if ((await listDashboards(workspaceId)).length === 0) {
    await createDashboard({
      workspaceId,
      name: "Growth overview",
      description:
        "Revenue, acquisition, and product mix from the sample warehouse. Duplicate it or ask Dash MCP to add charts.",
      widgets: demoWidgets(source.id),
      createdBy: admin._id,
    });
  }
  await progress.updateOne({ _id: "demo-seed" }, { $set: { complete: true } });
}

export function ensureSeeded(): Promise<void> {
  if (!seedTask) {
    seedTask = seedOnce().catch((error: unknown) => {
      seedTask = undefined;
      throw error;
    });
  }
  return seedTask;
}
