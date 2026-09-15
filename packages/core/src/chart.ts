export const CHART_TYPES = [
  "line",
  "area",
  "bar",
  "column",
  "pie",
  "donut",
  "scatter",
] as const;

export type ChartType = (typeof CHART_TYPES)[number];

export function isChartType(value: string): value is ChartType {
  return (CHART_TYPES as readonly string[]).includes(value);
}

export interface ChartEncode {
  x?: string;
  y?: string | string[];
  color?: string;
  name?: string;
  value?: string;
}

/**
 * JSON chart spec that MCP clients and the dashboard builder share.
 * Rendering is left to the web app (Apache ECharts in the MVP).
 */
export interface ChartSpec {
  type: ChartType;
  title?: string;
  encode: ChartEncode;
  stacked?: boolean;
  smooth?: boolean;
}
