import type { AdapterQuery } from "./adapter.ts";
import type { ChartSpec } from "./chart.ts";

export interface GridLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type WidgetType = "chart" | "table" | "kpi";

export interface KpiSpec {
  aggregation: "sum" | "avg" | "count" | "min" | "max";
  column: string;
  format?: "number" | "currency" | "percent";
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  layout: GridLayout;
  dataSourceId: string;
  query: AdapterQuery;
  chart?: ChartSpec;
  kpi?: KpiSpec;
}

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
